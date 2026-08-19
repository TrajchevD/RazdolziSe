namespace TripSplit.Api.Dtos;

public record CreateTripRequest(string Name, string SettlementCurrency = "EUR");

public record AddMemberRequest(string Email);

public record AddGuestRequest(string DisplayName);

// See TripService.JoinByCodeAsync.
public record JoinTripRequest(string Code);

// UserId is null for a guest with no account.
public record TripMemberResponse(Guid TripMemberId, Guid? UserId, string DisplayName);

// CallerRole is computed per-request server-side (Trip.OwnerId == the caller's
// resolved user id ? "Owner" : "Member") — see TripService.MapToResponse. Gates
// owner-only UI client-side (trip-detail.ts's isOwner()); the backend
// independently re-checks ownership on every owner-only action, this is not
// the real security boundary. InviteTokenActive is always true today (every
// trip always has exactly one live JoinCode — see EnsureJoinCodeAsync) but is
// still sent explicitly so the frontend contract doesn't silently rely on
// "field absent means true."
public record TripResponse(Guid Id, string Name, Guid OwnerId, DateTime CreatedAt, string SettlementCurrency, string JoinCode, bool InviteTokenActive, string CallerRole, List<TripMemberResponse> Members);

// Returned by GET /api/trips/join/{code} — the public preview shown before any
// claim happens (see join/join-claim.ts). Deliberately anonymous-reachable
// (see TripsController.GetJoinPreview): a brand-new visitor has no identity at
// all yet, and needs to see the trip name before deciding how to continue.
// CallerMembership is non-null only when the request carried a valid JWT
// (guest, login, or register already completed) AND that identity already has
// a slot on this trip — "already in, skip the picker" (see join-claim.ts).
public record TripJoinPreviewResponse(Guid TripId, string TripName, string SettlementCurrency, List<TripMemberResponse> UnclaimedMembers, TripMemberResponse? CallerMembership);

// Exactly one of TripMemberId (claim an existing unclaimed name) or
// NewDisplayName (self-add under a brand-new name) should be set — see
// TripService.ClaimMemberAsync.
public record ClaimMemberRequest(Guid? TripMemberId, string? NewDisplayName);
