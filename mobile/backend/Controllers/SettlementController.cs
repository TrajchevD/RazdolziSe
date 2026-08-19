using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/trips/{tripId:guid}")]
public class SettlementController : ControllerBase
{
    private readonly ISettlementService _settlementService;

    public SettlementController(ISettlementService settlementService)
    {
        _settlementService = settlementService;
    }

    [HttpGet("balances")]
    public async Task<ActionResult<List<BalanceResponse>>> GetBalances(Guid tripId)
    {
        var result = await _settlementService.GetBalancesAsync(tripId, this.GetUserId());
        return Ok(result);
    }

    [HttpGet("settlement-plan")]
    public async Task<ActionResult<List<SettlementTransactionResponse>>> GetSettlementPlan(Guid tripId)
    {
        var result = await _settlementService.GetSettlementPlanAsync(tripId, this.GetUserId());
        return Ok(result);
    }

    [HttpGet("payments")]
    public async Task<ActionResult<List<PaymentResponse>>> GetPayments(Guid tripId)
    {
        var result = await _settlementService.GetPaymentsAsync(tripId, this.GetUserId());
        return Ok(result);
    }

    [HttpPost("payments")]
    public async Task<ActionResult<PaymentResponse>> RecordPayment(Guid tripId, RecordPaymentRequest request)
    {
        var result = await _settlementService.RecordPaymentAsync(tripId, this.GetUserId(), request);
        return Ok(result);
    }
}
