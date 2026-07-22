namespace TripSplit.Api.Dtos;

// Amount is only used (and required) when SplitType == "Exact"; for "Equal" it's ignored
// and the total is divided evenly among every TripMemberId listed here.
public record ExpenseShareInput(Guid TripMemberId, decimal? Amount);

public record CreateExpenseRequest(
    Guid PaidByTripMemberId,
    string Description,
    decimal Amount,
    DateTime ExpenseDate,
    string SplitType, // "Equal" or "Exact"
    List<ExpenseShareInput> Shares,
    string Category = "Other" // "Lodging" | "Transport" | "Food" | "Groceries" | "Activities" | "Other"
);

public record ExpenseShareResponse(Guid TripMemberId, string DisplayName, decimal AmountOwed);

public record ExpenseResponse(
    Guid Id,
    string Description,
    decimal Amount,
    DateTime ExpenseDate,
    Guid PaidByTripMemberId,
    string PaidByDisplayName,
    string SplitType,
    List<ExpenseShareResponse> Shares,
    string Category,
    Guid CreatedByTripMemberId
);
