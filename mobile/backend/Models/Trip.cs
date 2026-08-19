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

    // Short shareable code (see TripService.GenerateJoinCode) — lets someone join
    // without an email invite: enter or scan the code and land straight in the
    // trip (see TripService.JoinByCodeAsync). This is layered on top of the
    // existing TripInvite consent flow, not a replacement for it — a code is just
    // a second, faster way to end up with the same TripMember row.
    // Nullable so trips created before this feature existed don't need a backfill
    // migration — TripService.EnsureJoinCodeAsync lazily generates one the next
    // time such a trip is loaded.
    public string? JoinCode { get; set; }

    public ICollection<TripMember> Members { get; set; } = new List<TripMember>();
    public ICollection<Expense> Expenses { get; set; } = new List<Expense>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
