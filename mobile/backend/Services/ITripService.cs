using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface ITripService
{
    Task<TripResponse> CreateTripAsync(Guid ownerUserId, CreateTripRequest request);
    Task<List<TripResponse>> GetTripsForUserAsync(Guid userId);
    Task<TripResponse> GetTripAsync(Guid tripId, Guid requestingUserId);
    Task<TripResponse> AddMemberAsync(Guid tripId, Guid requestingUserId, AddMemberRequest request);
    Task<TripResponse> AddGuestAsync(Guid tripId, Guid requestingUserId, AddGuestRequest request);
    Task<TripResponse> JoinByCodeAsync(Guid userId, JoinTripRequest request);
    Task DeleteTripAsync(Guid tripId, Guid requestingUserId);

    // Backs the /join/{inviteToken} screen (join/join-claim.ts). requestingUserId
    // is null for a not-yet-authenticated visitor — deliberately allowed, so the
    // trip name/unclaimed list can render before anyone picks how to continue
    // (guest/login/register). See TripsController.GetJoinPreview.
    Task<TripJoinPreviewResponse> GetJoinPreviewAsync(string joinCode, Guid? requestingUserId);

    // Always requires an already-resolved identity (guest/login/register) — see
    // TripsController.ClaimMember. Idempotent the same way JoinByCodeAsync is:
    // a caller who's already a member of this trip is a no-op, not an error.
    Task<TripResponse> ClaimMemberAsync(string joinCode, Guid requestingUserId, ClaimMemberRequest request);

    // Owner-only — mints a fresh JoinCode, invalidating the old link/QR for
    // anyone who hasn't claimed a slot with it yet.
    Task<TripResponse> RegenerateInviteTokenAsync(Guid tripId, Guid requestingUserId);
}
