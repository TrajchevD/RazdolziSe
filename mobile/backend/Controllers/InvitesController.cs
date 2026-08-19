using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

/// <summary>
/// Base route is the user-scoped side (your own pending invites) — sending an
/// invite is trip-scoped instead, so that one action overrides with an absolute
/// route rather than living under a mismatched base, same shape ExpensesController
/// uses for its trip-scoped routes.
/// </summary>
[ApiController]
[Authorize]
[Route("api/invites")]
public class InvitesController : ControllerBase
{
    private readonly ITripInviteService _inviteService;

    public InvitesController(ITripInviteService inviteService)
    {
        _inviteService = inviteService;
    }

    [HttpPost("/api/trips/{tripId:guid}/invites")]
    public async Task<ActionResult<TripInviteResponse>> SendInvite(Guid tripId, CreateInviteRequest request)
    {
        var result = await _inviteService.SendInviteAsync(tripId, this.GetUserId(), request);
        return Ok(result);
    }

    [HttpGet]
    public async Task<ActionResult<List<TripInviteResponse>>> GetMyInvites()
    {
        var result = await _inviteService.GetMyInvitesAsync(this.GetUserId());
        return Ok(result);
    }

    [HttpPost("{inviteId:guid}/accept")]
    public async Task<IActionResult> Accept(Guid inviteId)
    {
        await _inviteService.AcceptInviteAsync(inviteId, this.GetUserId());
        return NoContent();
    }

    [HttpPost("{inviteId:guid}/decline")]
    public async Task<IActionResult> Decline(Guid inviteId)
    {
        await _inviteService.DeclineInviteAsync(inviteId, this.GetUserId());
        return NoContent();
    }
}
