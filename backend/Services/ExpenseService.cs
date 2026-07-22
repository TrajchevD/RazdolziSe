using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class ExpenseService : IExpenseService
{
    private static readonly string[] ValidSplitTypes = ["Equal", "Exact"];

    // Purely cosmetic (icon/color in the UI) — kept as a fixed set rather than a free
    // string so the frontend can reliably map every expense to a known tile/color.
    private static readonly string[] ValidCategories = ["Lodging", "Transport", "Food", "Groceries", "Activities", "Other"];

    private readonly AppDbContext _db;

    public ExpenseService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ExpenseResponse> AddExpenseAsync(Guid tripId, Guid requestingUserId, CreateExpenseRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var requestingMember = trip.Members.SingleOrDefault(m => m.UserId == requestingUserId)
            ?? throw new UnauthorizedAccessException("You are not a member of this trip.");

        var shares = ValidateAndResolveShares(trip, request);

        var expense = new Expense
        {
            TripId = tripId,
            PaidByTripMemberId = request.PaidByTripMemberId,
            Description = request.Description.Trim(),
            Amount = request.Amount,
            SplitType = request.SplitType,
            Category = request.Category,
            ExpenseDate = request.ExpenseDate,
            CreatedByTripMemberId = requestingMember.Id,
        };

        foreach (var (memberId, amountOwed) in shares)
        {
            expense.Shares.Add(new ExpenseShare
            {
                TripMemberId = memberId,
                AmountOwed = amountOwed,
            });
        }

        _db.Expenses.Add(expense);
        await _db.SaveChangesAsync();

        return await MapToResponseAsync(expense.Id);
    }

    public async Task<ExpenseResponse> UpdateExpenseAsync(Guid tripId, Guid expenseId, Guid requestingUserId, CreateExpenseRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var requestingMember = trip.Members.SingleOrDefault(m => m.UserId == requestingUserId)
            ?? throw new UnauthorizedAccessException("You are not a member of this trip.");

        var expense = await _db.Expenses
            .Include(e => e.Shares)
            .SingleOrDefaultAsync(e => e.Id == expenseId && e.TripId == tripId)
            ?? throw new KeyNotFoundException("Expense not found.");

        if (expense.CreatedByTripMemberId != requestingMember.Id)
        {
            throw new UnauthorizedAccessException("Only the person who added this expense can edit it.");
        }

        var shares = ValidateAndResolveShares(trip, request);

        expense.PaidByTripMemberId = request.PaidByTripMemberId;
        expense.Description = request.Description.Trim();
        expense.Amount = request.Amount;
        expense.SplitType = request.SplitType;
        expense.Category = request.Category;
        expense.ExpenseDate = request.ExpenseDate;

        // Simplest correct way to replace a split: drop every old share row and
        // re-add fresh ones from scratch, rather than trying to diff and patch
        // individual rows (which split type/amount changes would make fiddly).
        //
        // Deliberately NOT calling expense.Shares.Clear() here (the previous version
        // did, in addition to RemoveRange). ExpenseShare -> Expense is a required
        // relationship, so clearing the navigation collection ALSO makes EF Core treat
        // those rows as newly-orphaned and mark them for deletion via its own fixup —
        // on top of the explicit RemoveRange already doing the same thing. That could
        // produce a duplicate DELETE for the same row in one SaveChanges batch, which
        // SQL Server reports as "expected 1 row, affected 0" the second time — exactly
        // this exception. Only ever mark a row deleted through ONE path, not two.
        _db.ExpenseShares.RemoveRange(expense.Shares);
        foreach (var (memberId, amountOwed) in shares)
        {
            _db.ExpenseShares.Add(new ExpenseShare
            {
                ExpenseId = expense.Id,
                TripMemberId = memberId,
                AmountOwed = amountOwed,
            });
        }

        await _db.SaveChangesAsync();

        return await MapToResponseAsync(expense.Id);
    }

    public async Task DeleteExpenseAsync(Guid tripId, Guid expenseId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var requestingMember = trip.Members.SingleOrDefault(m => m.UserId == requestingUserId)
            ?? throw new UnauthorizedAccessException("You are not a member of this trip.");

        var expense = await _db.Expenses
            .SingleOrDefaultAsync(e => e.Id == expenseId && e.TripId == tripId)
            ?? throw new KeyNotFoundException("Expense not found.");

        if (expense.CreatedByTripMemberId != requestingMember.Id)
        {
            throw new UnauthorizedAccessException("Only the person who added this expense can delete it.");
        }

        // ExpenseShare rows cascade-delete with their parent Expense (configured in
        // AppDbContext), so nothing else needs cleaning up here.
        _db.Expenses.Remove(expense);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Shared validation for both creating and editing an expense: payer/participants
    /// must be trip members, description/amount/split type must be well-formed, and
    /// the split itself (equal or exact) must resolve to valid per-person amounts.
    /// </summary>
    private static List<(Guid MemberId, decimal AmountOwed)> ValidateAndResolveShares(Trip trip, CreateExpenseRequest request)
    {
        if (!trip.Members.Any(m => m.Id == request.PaidByTripMemberId))
        {
            throw new InvalidOperationException("The payer must be a member of this trip.");
        }

        if (string.IsNullOrWhiteSpace(request.Description))
        {
            throw new InvalidOperationException("Description is required.");
        }

        if (request.Amount <= 0)
        {
            throw new InvalidOperationException("Amount must be greater than zero.");
        }

        if (!ValidSplitTypes.Contains(request.SplitType))
        {
            throw new InvalidOperationException("Split type must be 'Equal' or 'Exact'.");
        }

        if (!ValidCategories.Contains(request.Category))
        {
            throw new InvalidOperationException(
                $"Category must be one of: {string.Join(", ", ValidCategories)}.");
        }

        if (request.Shares is null || request.Shares.Count == 0)
        {
            throw new InvalidOperationException("An expense must be split among at least one participant.");
        }

        // Each participant may appear at most once — a duplicate would otherwise create
        // two separate ExpenseShare rows for the same member, silently double-counting
        // their share of the expense.
        if (request.Shares.Select(s => s.TripMemberId).Distinct().Count() != request.Shares.Count)
        {
            throw new InvalidOperationException("Each participant can only appear once in the split.");
        }

        var participantIds = request.Shares.Select(s => s.TripMemberId).Distinct().ToList();
        var validMemberIds = trip.Members.Select(m => m.Id).ToHashSet();
        if (!participantIds.All(validMemberIds.Contains))
        {
            throw new InvalidOperationException("All participants must be members of this trip.");
        }

        return ResolveShares(request.SplitType, request.Amount, request.Shares, participantIds);
    }

    public async Task<List<ExpenseResponse>> GetExpensesAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (!trip.Members.Any(m => m.UserId == requestingUserId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }

        var expenseIds = await _db.Expenses
            .Where(e => e.TripId == tripId)
            .OrderByDescending(e => e.ExpenseDate)
            .Select(e => e.Id)
            .ToListAsync();

        var results = new List<ExpenseResponse>();
        foreach (var id in expenseIds)
        {
            results.Add(await MapToResponseAsync(id));
        }
        return results;
    }

    /// <summary>
    /// Dispatches to the right split calculation for the requested <paramref name="splitType"/>.
    /// </summary>
    private static List<(Guid MemberId, decimal AmountOwed)> ResolveShares(
        string splitType,
        decimal totalAmount,
        List<ExpenseShareInput> shareInputs,
        List<Guid> participantIds)
    {
        return splitType switch
        {
            "Exact" => BuildExactShares(totalAmount, shareInputs),
            _ => BuildEqualShares(totalAmount, participantIds),
        };
    }

    /// <summary>
    /// Splits <paramref name="amount"/> equally among <paramref name="memberIds"/>.
    /// Plain division almost never comes out even in cents (e.g. $10.00 / 3 = $3.33333...),
    /// so this floors each share to the nearest cent, then hands the leftover cents out
    /// one at a time — in a fixed, deterministic order (sorted by member id) — until the
    /// shares sum to exactly the original amount. Same inputs always produce the same
    /// split, which matters for tests and for anyone auditing the numbers later.
    /// </summary>
    private static List<(Guid MemberId, decimal AmountOwed)> BuildEqualShares(decimal amount, List<Guid> memberIds)
    {
        var ordered = memberIds.OrderBy(id => id).ToList();
        var count = ordered.Count;

        var baseShare = Math.Floor(amount / count * 100m) / 100m;
        var allocated = baseShare * count;
        var remainderCents = (int)Math.Round((amount - allocated) * 100m);

        var result = new List<(Guid, decimal)>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var share = baseShare;
            if (i < remainderCents)
            {
                share += 0.01m;
            }
            result.Add((ordered[i], share));
        }
        return result;
    }

    /// <summary>
    /// Splits by the exact per-person amounts the caller provided (e.g. gas is $1000:
    /// $500/$250/$250). Every participant must supply a positive amount, and the amounts
    /// must add up to the expense total — enforced here, not just in the UI, since the
    /// UI's validation can always be bypassed by calling the API directly.
    /// </summary>
    private static List<(Guid MemberId, decimal AmountOwed)> BuildExactShares(decimal totalAmount, List<ExpenseShareInput> shareInputs)
    {
        if (shareInputs.Any(s => s.Amount is null or <= 0))
        {
            throw new InvalidOperationException("Each participant's exact amount must be greater than zero.");
        }

        var sum = shareInputs.Sum(s => s.Amount!.Value);
        if (Math.Abs(sum - totalAmount) > 0.01m)
        {
            throw new InvalidOperationException(
                $"Exact amounts must add up to the total ({totalAmount:0.00}) — they currently sum to {sum:0.00}.");
        }

        return shareInputs.Select(s => (s.TripMemberId, s.Amount!.Value)).ToList();
    }

    private async Task<ExpenseResponse> MapToResponseAsync(Guid expenseId)
    {
        var expense = await _db.Expenses
            .Include(e => e.PaidBy)
            .Include(e => e.Shares).ThenInclude(s => s.TripMember)
            .SingleAsync(e => e.Id == expenseId);

        return new ExpenseResponse(
            expense.Id,
            expense.Description,
            expense.Amount,
            expense.ExpenseDate,
            expense.PaidByTripMemberId,
            expense.PaidBy!.DisplayName,
            expense.SplitType,
            expense.Shares.Select(s => new ExpenseShareResponse(
                s.TripMemberId,
                s.TripMember!.DisplayName,
                s.AmountOwed
            )).ToList(),
            expense.Category,
            expense.CreatedByTripMemberId
        );
    }
}
