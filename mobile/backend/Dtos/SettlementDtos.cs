namespace TripSplit.Api.Dtos;

public record BalanceResponse(Guid TripMemberId, string DisplayName, decimal NetBalance);

public record SettlementTransactionResponse(
    Guid FromTripMemberId,
    string FromDisplayName,
    Guid ToTripMemberId,
    string ToDisplayName,
    decimal Amount
);

public record RecordPaymentRequest(Guid FromTripMemberId, Guid ToTripMemberId, decimal Amount);

public record PaymentResponse(
    Guid Id,
    Guid FromTripMemberId,
    string FromDisplayName,
    Guid ToTripMemberId,
    string ToDisplayName,
    decimal Amount,
    DateTime PaidAt
);
