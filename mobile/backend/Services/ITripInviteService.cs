using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface ITripInviteService
{
    Task<TripInviteResponse> SendInviteAsync(Guid tripId, Guid requestingUserId, CreateInviteRequest request);
    Task<List<TripInviteResponse>> GetMyInvitesAsync(Guid userId);
    Task AcceptInviteAsync(Guid inviteId, Guid userId);
    Task DeclineInviteAsync(Guid inviteId, Guid userId);
}
