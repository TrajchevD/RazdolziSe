namespace TripSplit.Api.Dtos;

// Amount is only used (and required) when SplitType == "Exact"; for "Equal" it's ignored
// and the total is divided evenly among every TripMemberId listed here.
public record ExpenseShareInput(Guid TripMemberId, decimal? Amount);

public record CreateExpenseRequest(
    Guid PaidByTripMemberId,
    string Description,
    decimal Amount, // in Currency below, NOT necessarily the trip's settlement currency
    string Currency, // ISO 4217 code, e.g. "USD", "EUR", "MKD" — whatever the user actually paid in
    DateTime ExpenseDate,
    string SplitType, // "Equal" or "Exact"
    List<ExpenseShareInput> Shares, // for "Exact", each Amount is also in Currency above
    string Category = "Other" // "Lodging" | "Transport" | "Food" | "Groceries" | "Activities" | "Other"
);

public record ExpenseShareResponse(Guid TripMemberId, string DisplayName, decimal AmountOwed);

public record ExpenseResponse(
    Guid Id,
    string Description,
    decimal Amount, // converted, in the trip's settlement currency
    decimal OriginalAmount, // as entered, in Currency below
    string Currency,
    decimal ExchangeRate, // Currency -> trip settlement currency, frozen when this expense was last saved
    DateTime ExpenseDate,
    Guid PaidByTripMemberId,
    string PaidByDisplayName,
    string SplitType,
    List<ExpenseShareResponse> Shares,
    string Category,
    Guid CreatedByTripMemberId
);
