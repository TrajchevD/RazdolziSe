namespace TripSplit.Api.Models;

public class Trip
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;

    // ISO 4217 code (e.g. "EUR", "MKD", "USD") that every balance, settlement
    // suggestion, and stats total is expressed in. Individual expenses can still be
    // logged in a different currency (see Expense.Currency) — they get converted to
    // this one at the moment they're added, using the rate frozen at that time.
    public string SettlementCurrency { get; set; } = "EUR";

    public Guid OwnerId { get; set; }
    public User? Owner { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TripMember> Members { get; set; } = new List<TripMember>();
    public ICollection<Expense> Expenses { get; set; } = new List<Expense>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
