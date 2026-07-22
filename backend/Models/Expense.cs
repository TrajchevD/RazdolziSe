namespace TripSplit.Api.Models;

public class Expense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TripId { get; set; }
    public Trip? Trip { get; set; }
    public Guid PaidByTripMemberId { get; set; }
    public TripMember? PaidBy { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }

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
