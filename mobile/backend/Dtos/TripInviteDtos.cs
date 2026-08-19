namespace TripSplit.Api.Dtos;

// UserId, not email — discovery of who to invite happens client-side first (the
// Friends list, or a Name#Tag search reusing FriendService.SearchAsync), so by
// the time this request is sent the target user is already resolved. Keeps trip
// invites on the same "email is for login/recovery, Tag is for discovery" split
// as the rest of the app — see FriendDtos.cs's SearchUserRequest.
public record CreateInviteRequest(Guid UserId);

public record TripInviteResponse(
    Guid Id,
    Guid TripId,
    string TripName,
    Guid InvitedByUserId,
    string InvitedByDisplayName,
    DateTime CreatedAt
);
