using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface IExpenseService
{
    Task<ExpenseResponse> AddExpenseAsync(Guid tripId, Guid requestingUserId, CreateExpenseRequest request);
    Task<List<ExpenseResponse>> GetExpensesAsync(Guid tripId, Guid requestingUserId);
    Task<ExpenseResponse> UpdateExpenseAsync(Guid tripId, Guid expenseId, Guid requestingUserId, CreateExpenseRequest request);
    Task DeleteExpenseAsync(Guid tripId, Guid expenseId, Guid requestingUserId);
}
