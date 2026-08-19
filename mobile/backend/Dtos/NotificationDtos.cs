namespace TripSplit.Api.Dtos;

// "PaymentReceived"/"FriendRequest"/"FriendRequestAccepted" rows are real
// AppNotification rows (persisted, can be marked read). "InactivityNudge" rows
// are computed fresh on every request from current balances + last activity —
// never stored, so there's no Id that survives between calls; MarkReadAsync
// only accepts a persisted row's id (see AppNotificationService.MarkReadAsync's
// NotFound-if-nudge behavior). TripId/TripName are null for anything that
// isn't trip-scoped (FriendRequest/FriendRequestAccepted) — the frontend links
// trip-scoped rows to that trip and everything else to the Friends tab instead.
public record NotificationResponse(
    Guid Id,
    string Kind,
    Guid? TripId,
    string? TripName,
    string Message,
    DateTime CreatedAt,
    bool IsRead
);
