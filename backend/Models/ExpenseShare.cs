namespace TripSplit.Api.Models;

public class ExpenseShare
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExpenseId { get; set; }
    public Expense? Expense { get; set; }
    public Guid TripMemberId { get; set; }
    public TripMember? TripMember { get; set; }
    public decimal AmountOwed { get; set; }
}
