using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public interface IAppNotificationService
{
    // Called from SettlementService.RecordPaymentAsync right after a payment is
    // saved — a no-op if the recipient TripMember has no linked User (a guest
    // with no account has nowhere to receive this).
    Task NotifyPaymentReceivedAsync(Payment payment);

    // Called from FriendService right after a request is created/accepted.
    // Neither is trip-scoped (see AppNotification.TripId being nullable).
    Task NotifyFriendRequestAsync(Friendship friendship);
    Task NotifyFriendRequestAcceptedAsync(Friendship friendship);

    // Called from TripInviteService right after an invite is created. Trip-scoped
    // (unlike the two above) — tripName/invitedByDisplayName are passed in rather
    // than re-queried here since the caller already has both loaded.
    Task NotifyTripInviteAsync(TripInvite invite, string tripName, string invitedByDisplayName);

    // Called from TripService.ClaimMemberAsync right after someone joins via a
    // shared invite link/QR (both the "claimed a premade slot" and "self-added
    // under a new name" branches) — lets the trip Owner know without them having
    // to keep re-opening the trip to check. A no-op if the trip has no Owner
    // account behind it or the joiner IS the owner (shouldn't happen — the owner
    // is already a member from CreateTripAsync — but guarded defensively anyway).
    Task NotifyTripMemberJoinedAsync(Trip trip, string joinedDisplayName);

    // Persisted "payment received" rows for this user, merged with freshly
    // computed inactivity nudges (see AppNotificationService for why nudges are
    // never stored), newest first.
    Task<List<NotificationResponse>> GetNotificationsAsync(Guid userId);

    // Only ever succeeds for a persisted (PaymentReceived) notification the
    // caller owns — see NotificationResponse.Kind.
    Task MarkReadAsync(Guid userId, Guid notificationId);

    // Permanently removes a persisted notification the caller owns. Same
    // "persisted rows only" scope as MarkReadAsync — an InactivityNudge's id is
    // synthetic/deterministic and was never a row in AppNotifications, so there's
    // nothing here to delete for one; the caller just won't find a match.
    Task DeleteAsync(Guid userId, Guid notificationId);
}
