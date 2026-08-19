using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

// Anonymous on purpose: this only ever pre-fills a currency dropdown (on the
// register/create-trip form and similar), never touches user data, and gating it
// behind auth would just mean an extra round trip after login for no real benefit.
[ApiController]
[AllowAnonymous]
[Route("api/currency")]
public class CurrencyController : ControllerBase
{
    private readonly IIpCurrencyService _ipCurrencyService;

    public CurrencyController(IIpCurrencyService ipCurrencyService)
    {
        _ipCurrencyService = ipCurrencyService;
    }

    [HttpGet("suggest")]
    public async Task<ActionResult<CurrencySuggestionResponse>> Suggest()
    {
        var currency = await _ipCurrencyService.SuggestCurrencyAsync(GetClientIp());
        return Ok(new CurrencySuggestionResponse(currency));
    }

    /// <summary>
    /// Render (and most PaaS hosts) sit behind a reverse proxy, so the real client IP
    /// arrives in X-Forwarded-For — Connection.RemoteIpAddress would just be the
    /// proxy's own internal address.
    /// </summary>
    private string? GetClientIp()
    {
        var forwarded = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            return forwarded.Split(',')[0].Trim();
        }

        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
