namespace TripSplit.Api.Models;

/// <summary>
/// Records an actual payment made outside the app — e.g. cash handed over, or a bank
/// transfer — to settle (fully or partially) a debt between two trip members. This is
/// separate from Expense: an Expense represents money spent on something and split
/// among people; a Payment represents money moved directly from one member to another
/// to clear a balance. Recording one shrinks both members' outstanding balances without
/// changing who "spent" what.
/// </summary>
public class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TripId { get; set; }
    public Trip? Trip { get; set; }

    public Guid FromTripMemberId { get; set; }
    public TripMember? FromTripMember { get; set; }

    public Guid ToTripMemberId { get; set; }
    public TripMember? ToTripMember { get; set; }

    public decimal Amount { get; set; }
    public DateTime PaidAt { get; set; } = DateTime.UtcNow;
}
