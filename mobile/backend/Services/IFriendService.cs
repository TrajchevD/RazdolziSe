using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface IFriendService
{
    // Parses "DisplayName#TAG" (see FriendService.SearchAsync) and finds the
    // matching user, if any — the frontend then calls SendRequestAsync with
    // the returned UserId. Throws KeyNotFoundException if nobody matches.
    Task<UserSummaryResponse> SearchAsync(Guid requestingUserId, string query);

    Task<FriendRequestResponse> SendRequestAsync(Guid requestingUserId, Guid targetUserId);
    Task<FriendResponse> AcceptRequestAsync(Guid userId, Guid friendshipId);
    Task DeclineRequestAsync(Guid userId, Guid friendshipId);
    Task RemoveFriendAsync(Guid userId, Guid friendUserId);

    Task<List<FriendResponse>> GetFriendsAsync(Guid userId);
    Task<List<FriendRequestResponse>> GetIncomingRequestsAsync(Guid userId);
    Task<List<FriendRequestResponse>> GetOutgoingRequestsAsync(Guid userId);
}
