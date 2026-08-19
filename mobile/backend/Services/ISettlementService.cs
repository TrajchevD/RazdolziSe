using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface ISettlementService
{
    Task<List<BalanceResponse>> GetBalancesAsync(Guid tripId, Guid requestingUserId);
    Task<List<SettlementTransactionResponse>> GetSettlementPlanAsync(Guid tripId, Guid requestingUserId);
    Task<PaymentResponse> RecordPaymentAsync(Guid tripId, Guid requestingUserId, RecordPaymentRequest request);
    Task<List<PaymentResponse>> GetPaymentsAsync(Guid tripId, Guid requestingUserId);
}
