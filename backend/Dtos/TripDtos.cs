namespace TripSplit.Api.Dtos;

public record CreateTripRequest(string Name);

public record AddMemberRequest(string Email);

public record AddGuestRequest(string DisplayName);

// UserId is null for a guest with no account.
public record TripMemberResponse(Guid TripMemberId, Guid? UserId, string DisplayName);

public record TripResponse(Guid Id, string Name, Guid OwnerId, DateTime CreatedAt, List<TripMemberResponse> Members);
