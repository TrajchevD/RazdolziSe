namespace TripSplit.Api.Models;

/// <summary>
/// A pending "will you join this trip" ask. Deliberately has no Status column —
/// a row only exists while the invite is pending; accepting converts it into a
/// real TripMember (see TripInviteService.AcceptInviteAsync) and deletes this
/// row, declining just deletes it. Keeping no history of past
/// accepted/declined invites is a real simplification, same spirit as this
/// project's other "internship scope" trade-offs (see README.md) — worth
/// revisiting if you ever want an activity log of who declined what.
/// </summary>
public class TripInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TripId { get; set; }
    public Trip? Trip { get; set; }

    // Always a registered user — you can only invite someone who already has an
    // account (same constraint the existing instant-add-by-email flow has), so
    // there's always someone who can see and act on this invite.
    public Guid InvitedUserId { get; set; }
    public User? InvitedUser { get; set; }

    // The trip member who sent it — a TripMember, not a User, so the invite
    // still shows a sensible "invited by" name even if that member later left
    // the trip (TripMember rows aren't deleted when a trip is left; there's no
    // "leave trip" feature yet, but this keeps the invite's own data self-
    // contained regardless).
    public Guid InvitedByTripMemberId { get; set; }
    public TripMember? InvitedByTripMember { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
