namespace TripSplit.Api.Models;

public enum FriendshipStatus
{
    Pending,
    Accepted,
}

/// <summary>
/// One row per friend relationship (Pending or Accepted) between two users —
/// direction only matters while Pending (the addressee sees "accept/decline",
/// the requester sees "pending sent"); once Accepted the relationship is
/// symmetric and every query treats either side the same way (see
/// FriendService.GetFriendsAsync). A declined/cancelled request is just
/// deleted rather than kept as a "Declined" row — there's no product reason to
/// remember a no, and it lets the same two people request each other again
/// later without a stale row blocking it.
/// </summary>
public class Friendship
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RequesterId { get; set; }
    public User? Requester { get; set; }

    public Guid AddresseeId { get; set; }
    public User? Addressee { get; set; }

    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }
}
