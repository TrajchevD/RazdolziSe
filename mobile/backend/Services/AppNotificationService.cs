using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class AppNotificationService : IAppNotificationService
{
    // Matches SettlementService's own epsilon — a balance under a cent is
    // "settled" for the same rounding-noise reason, and duplicated rather than
    // shared to avoid depending on ISettlementService directly (that service
    // will eventually call into this one to raise a payment notification, and a
    // two-way constructor dependency between the two would throw at startup).
    private const decimal Epsilon = 0.01m;
    private const int InactivityDays = 7;

    private readonly AppDbContext _db;

    public AppNotificationService(AppDbContext db)
    {
        _db = db;
    }

    public async Task NotifyPaymentReceivedAsync(Payment payment)
    {
        var toMember = await _db.TripMembers
            .Include(tm => tm.Trip)
            .SingleAsync(tm => tm.Id == payment.ToTripMemberId);

        // No account behind this member (an unregistered guest added by display
        // name only) — nothing to notify, there's no login that would ever see it.
        if (toMember.UserId is null)
        {
            return;
        }

        var fromMember = await _db.TripMembers.SingleAsync(tm => tm.Id == payment.FromTripMemberId);
        var currency = toMember.Trip!.SettlementCurrency;

        _db.AppNotifications.Add(new AppNotification
        {
            UserId = toMember.UserId.Value,
            Type = "PaymentReceived",
            TripId = payment.TripId,
            Message = $"{fromMember.DisplayName} paid you back {payment.Amount:0.##} {currency} in {toMember.Trip!.Name}.",
        });

        await _db.SaveChangesAsync();
    }

    public async Task NotifyFriendRequestAsync(Friendship friendship)
    {
        var requester = await _db.Users.SingleAsync(u => u.Id == friendship.RequesterId);

        _db.AppNotifications.Add(new AppNotification
        {
            UserId = friendship.AddresseeId,
            Type = "FriendRequest",
            TripId = null,
            Message = $"{requester.DisplayName}#{requester.Tag} sent you a friend request.",
        });

        await _db.SaveChangesAsync();
    }

    public async Task NotifyFriendRequestAcceptedAsync(Friendship friendship)
    {
        var addressee = await _db.Users.SingleAsync(u => u.Id == friendship.AddresseeId);

        _db.AppNotifications.Add(new AppNotification
        {
            UserId = friendship.RequesterId,
            Type = "FriendRequestAccepted",
            TripId = null,
            Message = $"{addressee.DisplayName}#{addressee.Tag} accepted your friend request.",
        });

        await _db.SaveChangesAsync();
    }

    public async Task NotifyTripInviteAsync(TripInvite invite, string tripName, string invitedByDisplayName)
    {
        _db.AppNotifications.Add(new AppNotification
        {
            UserId = invite.InvitedUserId,
            Type = "TripInvite",
            TripId = invite.TripId,
            Message = $"{invitedByDisplayName} invited you to {tripName}.",
        });

        await _db.SaveChangesAsync();
    }

    public async Task NotifyTripMemberJoinedAsync(Trip trip, string joinedDisplayName)
    {
        _db.AppNotifications.Add(new AppNotification
        {
            UserId = trip.OwnerId,
            Type = "TripMemberJoined",
            TripId = trip.Id,
            // Generic wording on purpose: this fires from both TripService.JoinByCodeAsync
            // (typed/scanned code) and ClaimMemberAsync (the /join/:code claim-a-name
            // flow) — it shouldn't claim a specific mechanism that isn't always true.
            Message = $"{joinedDisplayName} joined {trip.Name}.",
        });

        await _db.SaveChangesAsync();
    }

    public async Task<List<NotificationResponse>> GetNotificationsAsync(Guid userId)
    {
        // No .Include(n => n.Trip) needed — the .Select() below reads n.Trip.Name
        // directly (guarded by the null check, since TripId/Trip are optional for
        // non-trip-scoped rows like FriendRequest), which EF translates into its
        // own left join, same as every other Select-projected query in this codebase.
        var persisted = await _db.AppNotifications
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new NotificationResponse(
                n.Id,
                n.Type,
                n.TripId,
                n.Trip != null ? n.Trip.Name : null,
                n.Message,
                n.CreatedAt,
                n.IsRead
            ))
            .ToListAsync();

        var nudges = await GetInactivityNudgesAsync(userId);

        return persisted.Concat(nudges).OrderByDescending(n => n.CreatedAt).ToList();
    }

    /// <summary>
    /// Computed fresh on every call, never stored — see AppNotification's class
    /// comment for why. For each trip the user belongs to, checks whether their
    /// own balance in that trip is still non-zero AND nothing has happened in the
    /// trip (no new expense or payment) for at least <see cref="InactivityDays"/>
    /// days. Deliberately does NOT reuse SettlementService.GetBalancesAsync (which
    /// computes every member's balance, not just this user's) — that would need
    /// this service to depend on ISettlementService, and SettlementService is
    /// about to depend on this one (see NotifyPaymentReceivedAsync's caller), so a
    /// direct reuse would create a circular constructor dependency.
    /// </summary>
    private async Task<List<NotificationResponse>> GetInactivityNudgesAsync(Guid userId)
    {
        var memberships = await _db.TripMembers
            .Where(tm => tm.UserId == userId)
            .Include(tm => tm.Trip)
            .ToListAsync();

        var cutoff = DateTime.UtcNow.AddDays(-InactivityDays);
        var nudges = new List<NotificationResponse>();

        foreach (var member in memberships)
        {
            var totalPaid = await _db.Expenses
                .Where(e => e.PaidByTripMemberId == member.Id)
                .SumAsync(e => (decimal?)e.Amount) ?? 0m;
            var totalOwed = await _db.ExpenseShares
                .Where(s => s.TripMemberId == member.Id)
                .SumAsync(s => (decimal?)s.AmountOwed) ?? 0m;
            var totalSent = await _db.Payments
                .Where(p => p.FromTripMemberId == member.Id)
                .SumAsync(p => (decimal?)p.Amount) ?? 0m;
            var totalReceived = await _db.Payments
                .Where(p => p.ToTripMemberId == member.Id)
                .SumAsync(p => (decimal?)p.Amount) ?? 0m;

            var netBalance = (totalPaid - totalOwed) + (totalSent - totalReceived);

            // Settled already — skip the (more expensive) last-activity lookup
            // entirely rather than always paying for it.
            if (Math.Abs(netBalance) <= Epsilon)
            {
                continue;
            }

            var lastExpense = await _db.Expenses
                .Where(e => e.TripId == member.TripId)
                .OrderByDescending(e => e.CreatedAt)
                .Select(e => (DateTime?)e.CreatedAt)
                .FirstOrDefaultAsync();
            var lastPayment = await _db.Payments
                .Where(p => p.TripId == member.TripId)
                .OrderByDescending(p => p.PaidAt)
                .Select(p => (DateTime?)p.PaidAt)
                .FirstOrDefaultAsync();

            var lastActivity = new[] { lastExpense, lastPayment, member.Trip!.CreatedAt }
                .Where(d => d.HasValue)
                .Max()!.Value;

            if (lastActivity >= cutoff)
            {
                continue;
            }

            var currency = member.Trip!.SettlementCurrency;
            var message = netBalance < 0
                ? $"You still owe {Math.Abs(netBalance):0.##} {currency} in {member.Trip!.Name} — nothing's moved in over a week."
                : $"{member.Trip!.Name} still owes you {netBalance:0.##} {currency} — nothing's moved in over a week.";

            // A deterministic (not random) id derived from the trip, so the same
            // nudge shows the same id on every request instead of a fresh Guid
            // each time — nothing depends on that today (nudges aren't
            // markable-read), but it's what a client would expect from an id at all.
            var syntheticId = DeterministicGuid(member.TripId);

            nudges.Add(new NotificationResponse(
                syntheticId,
                "InactivityNudge",
                member.TripId,
                member.Trip!.Name,
                message,
                lastActivity,
                false
            ));
        }

        return nudges;
    }

    public async Task MarkReadAsync(Guid userId, Guid notificationId)
    {
        var notification = await _db.AppNotifications
            .SingleOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId)
            ?? throw new KeyNotFoundException("Notification not found.");

        notification.IsRead = true;
        await _db.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid userId, Guid notificationId)
    {
        var notification = await _db.AppNotifications
            .SingleOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId)
            ?? throw new KeyNotFoundException("Notification not found.");

        _db.AppNotifications.Remove(notification);
        await _db.SaveChangesAsync();
    }

    private static Guid DeterministicGuid(Guid tripId)
    {
        // Not cryptographic — just needs to be stable per trip id across calls.
        // XOR-ing with a fixed salt keeps it visibly distinct from the trip's own
        // id in logs/devtools, so nobody mistakes a nudge id for a trip id.
        var salt = new Guid("6e7dfe4c-7b6b-4a1c-9c7a-2f8b4a9d0e11");
        var tripBytes = tripId.ToByteArray();
        var saltBytes = salt.ToByteArray();
        var result = new byte[16];
        for (var i = 0; i < 16; i++)
        {
            result[i] = (byte)(tripBytes[i] ^ saltBytes[i]);
        }
        return new Guid(result);
    }
}
