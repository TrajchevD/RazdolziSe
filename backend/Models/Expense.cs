namespace TripSplit.Api.Models;

public class Expense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TripId { get; set; }
    public Trip? Trip { get; set; }
    public Guid PaidByTripMemberId { get; set; }
    public TripMember? PaidBy { get; set; }
    public string Description { get; set; } = string.Empty;

    // Amount is always in the trip's SettlementCurrency — every balance, share, and
    // settlement calculation in the app assumes this, so SettlementService and the
    // split math never need to know or care about currency conversion at all.
    public decimal Amount { get; set; }

    // What the user actually typed, and what currency it was in. Kept purely for
    // display ("you paid 3000 MKD") — never used in balance math, since Amount above
    // already holds the converted figure.
    public decimal OriginalAmount { get; set; }
    public string Currency { get; set; } = "EUR";

    // Currency -> Trip.SettlementCurrency rate at the moment this expense was
    // created/last edited, frozen permanently. Without freezing, a trip's historical
    // balances would silently drift every time exchange rates moved, which is worse
    // than just being slightly stale — nobody could audit "why did my balance change
    // and I didn't do anything."
    public decimal ExchangeRate { get; set; } = 1m;

    // "Equal" or "Exact" — stored so the UI can show how an expense was split
    // without having to re-derive it by comparing share amounts after the fact.
    public string SplitType { get; set; } = "Equal";

    // One of a fixed set (see ExpenseService.ValidCategories) — purely cosmetic,
    // used to pick an icon/color in the UI. Defaults to "Other" for anything unset.
    public string Category { get; set; } = "Other";

    public DateTime ExpenseDate { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Who originally added this expense — distinct from PaidByTripMemberId (someone can
    // log an expense that a different trip member paid for). Only this member may later
    // edit or delete it. Plain Guid, not modeled as an EF relationship/FK: it doesn't need
    // cascade-delete behavior of its own and this keeps the existing PaidBy/TripMember
    // relationship graph simple.
    public Guid CreatedByTripMemberId { get; set; }

    public ICollection<ExpenseShare> Shares { get; set; } = new List<ExpenseShare>();
}
