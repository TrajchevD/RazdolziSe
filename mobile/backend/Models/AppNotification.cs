namespace TripSplit.Api.Models;

/// <summary>
/// A persisted, in-app-only notification — no push infrastructure, no APNs/FCM
/// keys to manage, just a row a client fetches on its own schedule (poll on open/
/// foreground, see NotificationsController). Today the only kind that's actually
/// stored is "someone paid you back" (see SettlementService.RecordPaymentAsync);
/// the inactivity nudge described in the mobile plan is deliberately NOT a
/// persisted row — it's computed fresh on every GET (see
/// AppNotificationService.GetInactivityNudges) from data that already exists
/// (trip balances + last activity date), specifically so it needs no cron/
/// background job to keep it accurate. Render's free tier can't run one
/// reliably, and a computed-on-read nudge can never go stale the way a
/// pre-generated one could.
/// </summary>
public class AppNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Who sees this — always a real linked-or-guest User, never a TripMember
    // without an account (there's no login for those to notify).
    public Guid UserId { get; set; }
    public User? User { get; set; }

    // "PaymentReceived" (see SettlementService.RecordPaymentAsync), "FriendRequest",
    // or "FriendRequestAccepted" (see FriendService) today — a plain string rather
    // than a C# enum so a new kind never needs a migration to the column type, only
    // a new value. NotificationResponse.Kind passes this straight through to the
    // frontend, which switches on it to decide what a row links to.
    public string Type { get; set; } = string.Empty;

    // Nullable — only PaymentReceived rows are trip-scoped. A FriendRequest
    // notification has no trip at all, so forcing this to always have a value
    // would mean either a fake/sentinel trip id or losing the "which trip"
    // context PaymentReceived actually needs. Restrict (not cascade) — same
    // FK-ordering reasoning as every other Trip-referencing table with a
    // second independent cascade path off Trip (see AppDbContext's TripInvite
    // comment) — TripService.DeleteTripAsync deletes these explicitly first.
    public Guid? TripId { get; set; }
    public Trip? Trip { get; set; }

    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsRead { get; set; }
}
