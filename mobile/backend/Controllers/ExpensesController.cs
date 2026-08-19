using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/trips/{tripId:guid}/expenses")]
public class ExpensesController : ControllerBase
{
    private readonly IExpenseService _expenseService;

    public ExpensesController(IExpenseService expenseService)
    {
        _expenseService = expenseService;
    }

    [HttpPost]
    public async Task<ActionResult<ExpenseResponse>> AddExpense(Guid tripId, CreateExpenseRequest request)
    {
        var result = await _expenseService.AddExpenseAsync(tripId, this.GetUserId(), request);
        return Ok(result);
    }

    [HttpGet]
    public async Task<ActionResult<List<ExpenseResponse>>> GetExpenses(Guid tripId)
    {
        var result = await _expenseService.GetExpensesAsync(tripId, this.GetUserId());
        return Ok(result);
    }

    [HttpPut("{expenseId:guid}")]
    public async Task<ActionResult<ExpenseResponse>> UpdateExpense(Guid tripId, Guid expenseId, CreateExpenseRequest request)
    {
        var result = await _expenseService.UpdateExpenseAsync(tripId, expenseId, this.GetUserId(), request);
        return Ok(result);
    }

    [HttpDelete("{expenseId:guid}")]
    public async Task<IActionResult> DeleteExpense(Guid tripId, Guid expenseId)
    {
        await _expenseService.DeleteExpenseAsync(tripId, expenseId, this.GetUserId());
        return NoContent();
    }
}
