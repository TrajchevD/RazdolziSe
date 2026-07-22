using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class SettlementService : ISettlementService
{
    // Amounts within a cent of zero are treated as settled — guards against decimal
    // rounding noise leaving a balance like 0.0000000001 that never clears. Matches
    // ExpenseService's exact-split tolerance (also 0.01m): an expense whose custom
    // amounts are allowed to be a full cent off the total must not leave a residual
    // balance that this epsilon is too tight to ever consider "settled."
    private const decimal Epsilon = 0.01m;

    private readonly AppDbContext _db;

    public SettlementService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<BalanceResponse>> GetBalancesAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (!trip.Members.Any(m => m.UserId == requestingUserId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }

        // How much each member paid out, across every expense in this trip.
        var paidTotals = await _db.Expenses
            .Where(e => e.TripId == tripId)
            .GroupBy(e => e.PaidByTripMemberId)
            .Select(g => new { TripMemberId = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        // How much each member owes, across every expense share in this trip.
        var owedTotals = await _db.ExpenseShares
            .Where(s => s.Expense!.TripId == tripId)
            .GroupBy(s => s.TripMemberId)
            .Select(g => new { TripMemberId = g.Key, Total = g.Sum(s => s.AmountOwed) })
            .ToListAsync();

        // Settle-up payments already recorded directly move money between two members,
        // outside of any expense. Sending a payment reduces what you owe (moves your
        // balance toward zero from below); receiving one reduces what you're owed
        // (moves your balance toward zero from above).
        var sentTotals = await _db.Payments
            .Where(p => p.TripId == tripId)
            .GroupBy(p => p.FromTripMemberId)
            .Select(g => new { TripMemberId = g.Key, Total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var receivedTotals = await _db.Payments
            .Where(p => p.TripId == tripId)
            .GroupBy(p => p.ToTripMemberId)
            .Select(g => new { TripMemberId = g.Key, Total = g.Sum(p => p.Amount) })
            .ToListAsync();

        // Net balance = (what they paid, minus what they owe) + payments sent - payments received.
        // Positive => the group owes them. Negative => they owe the group.
        var balances = new List<BalanceResponse>();
        foreach (var member in trip.Members)
        {
            var totalPaid = paidTotals.FirstOrDefault(p => p.TripMemberId == member.Id)?.Total ?? 0m;
            var totalOwed = owedTotals.FirstOrDefault(o => o.TripMemberId == member.Id)?.Total ?? 0m;
            var totalSent = sentTotals.FirstOrDefault(s => s.TripMemberId == member.Id)?.Total ?? 0m;
            var totalReceived = receivedTotals.FirstOrDefault(r => r.TripMemberId == member.Id)?.Total ?? 0m;
            var netBalance = (totalPaid - totalOwed) + (totalSent - totalReceived);
            balances.Add(new BalanceResponse(member.Id, member.DisplayName, netBalance));
        }

        return balances;
    }

    public async Task<PaymentResponse> RecordPaymentAsync(Guid tripId, Guid requestingUserId, RecordPaymentRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (!trip.Members.Any(m => m.UserId == requestingUserId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }

        if (request.FromTripMemberId == request.ToTripMemberId)
        {
            throw new InvalidOperationException("A member cannot pay themselves.");
        }

        if (!trip.Members.Any(m => m.Id == request.FromTripMemberId) || !trip.Members.Any(m => m.Id == request.ToTripMemberId))
        {
            throw new InvalidOperationException("Both members must belong to this trip.");
        }

        if (request.Amount <= 0)
        {
            throw new InvalidOperationException("Payment amount must be greater than zero.");
        }

        var payment = new Payment
        {
            TripId = tripId,
            FromTripMemberId = request.FromTripMemberId,
            ToTripMemberId = request.ToTripMemberId,
            Amount = request.Amount,
        };

        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();

        return await MapPaymentToResponseAsync(payment.Id);
    }

    public async Task<List<PaymentResponse>> GetPaymentsAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (!trip.Members.Any(m => m.UserId == requestingUserId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }

        return await _db.Payments
            .Where(p => p.TripId == tripId)
            .Include(p => p.FromTripMember)
            .Include(p => p.ToTripMember)
            .OrderByDescending(p => p.PaidAt)
            .Select(p => new PaymentResponse(
                p.Id,
                p.FromTripMemberId,
                p.FromTripMember!.DisplayName,
                p.ToTripMemberId,
                p.ToTripMember!.DisplayName,
                p.Amount,
                p.PaidAt
            ))
            .ToListAsync();
    }

    private async Task<PaymentResponse> MapPaymentToResponseAsync(Guid paymentId)
    {
        var payment = await _db.Payments
            .Include(p => p.FromTripMember)
            .Include(p => p.ToTripMember)
            .SingleAsync(p => p.Id == paymentId);

        return new PaymentResponse(
            payment.Id,
            payment.FromTripMemberId,
            payment.FromTripMember!.DisplayName,
            payment.ToTripMemberId,
            payment.ToTripMember!.DisplayName,
            payment.Amount,
            payment.PaidAt
        );
    }

    public async Task<List<SettlementTransactionResponse>> GetSettlementPlanAsync(Guid tripId, Guid requestingUserId)
    {
        var balances = await GetBalancesAsync(tripId, requestingUserId);
        return ComputeGreedySettlement(balances);
    }

    /// <summary>
    /// The core settlement algorithm. Repeatedly matches whoever is owed the most
    /// money with whoever owes the most money, and settles the smaller of the two
    /// amounts between them directly. Each round fully zeroes out at least one
    /// person, so for N participants this never produces more than N-1 transactions
    /// — the practical minimum for "who pays whom."
    /// </summary>
    private static List<SettlementTransactionResponse> ComputeGreedySettlement(List<BalanceResponse> balances)
    {
        var creditors = new List<Ledger>(balances
            .Where(b => b.NetBalance > Epsilon)
            .Select(b => new Ledger(b.TripMemberId, b.DisplayName, b.NetBalance))
            .OrderByDescending(l => l.Remaining));

        var debtors = new List<Ledger>(balances
            .Where(b => b.NetBalance < -Epsilon)
            .Select(b => new Ledger(b.TripMemberId, b.DisplayName, -b.NetBalance))
            .OrderByDescending(l => l.Remaining));

        var transactions = new List<SettlementTransactionResponse>();

        var ci = 0;
        var di = 0;
        while (ci < creditors.Count && di < debtors.Count)
        {
            var creditor = creditors[ci];
            var debtor = debtors[di];

            var amount = Math.Round(Math.Min(creditor.Remaining, debtor.Remaining), 2);

            if (amount > 0)
            {
                transactions.Add(new SettlementTransactionResponse(
                    debtor.TripMemberId, debtor.DisplayName,
                    creditor.TripMemberId, creditor.DisplayName,
                    amount
                ));
            }

            creditor.Remaining -= amount;
            debtor.Remaining -= amount;

            if (creditor.Remaining <= Epsilon) ci++;
            if (debtor.Remaining <= Epsilon) di++;
        }

        return transactions;
    }

    private class Ledger
    {
        public Guid TripMemberId { get; }
        public string DisplayName { get; }
        public decimal Remaining { get; set; }

        public Ledger(Guid tripMemberId, string displayName, decimal remaining)
        {
            TripMemberId = tripMemberId;
            DisplayName = displayName;
            Remaining = remaining;
        }
    }
}
