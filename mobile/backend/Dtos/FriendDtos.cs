namespace TripSplit.Api.Dtos;

// "Alex#7Q2K" — the exact DisplayName#Tag shown on someone's Profile (or
// scanned from their identity QR, see FriendsController). See
// FriendService.SearchAsync for how this gets parsed.
public record SearchUserRequest(string Query);

public record UserSummaryResponse(Guid UserId, string DisplayName, string Tag);

// Either typed in from a search result or passed straight through from a
// TripMemberResponse.UserId already on screen (see FriendService.SendRequestAsync's
// "add a fellow trip member" call site) — same endpoint either way, since both
// paths already know exactly who they mean by the time they call this.
public record SendFriendRequestRequest(Guid UserId);

public record FriendRequestResponse(Guid Id, Guid UserId, string DisplayName, string Tag, DateTime CreatedAt);

public record FriendResponse(Guid UserId, string DisplayName, string Tag);
