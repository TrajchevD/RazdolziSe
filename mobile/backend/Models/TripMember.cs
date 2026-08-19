namespace TripSplit.Api.Models;

public class TripMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TripId { get; set; }
    public Trip? Trip { get; set; }

    // Null for a guest who has no account. Real users and guests both accrue
    // balances identically — the ledger only cares about TripMember, never
    // about whether a User row exists behind it.
    public Guid? UserId { get; set; }
    public User? User { get; set; }

    // Always set, for both real users and guests, so display never needs to
    // branch on whether UserId is null. For a real user this is copied from
    // User.DisplayName at the moment they join; for a guest it's entered directly.
    public string DisplayName { get; set; } = string.Empty;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
