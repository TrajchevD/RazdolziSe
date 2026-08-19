using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/trips")]
public class TripsController : ControllerBase
{
    private readonly ITripService _tripService;

    public TripsController(ITripService tripService)
    {
        _tripService = tripService;
    }

    [HttpPost]
    public async Task<ActionResult<TripResponse>> CreateTrip(CreateTripRequest request)
    {
        var result = await _tripService.CreateTripAsync(this.GetUserId(), request);
        return Ok(result);
    }

    [HttpGet]
    public async Task<ActionResult<List<TripResponse>>> GetMyTrips()
    {
        var result = await _tripService.GetTripsForUserAsync(this.GetUserId());
        return Ok(result);
    }

    [HttpGet("{tripId:guid}")]
    public async Task<ActionResult<TripResponse>> GetTrip(Guid tripId)
    {
        var result = await _tripService.GetTripAsync(tripId, this.GetUserId());
        return Ok(result);
    }

    [HttpPost("{tripId:guid}/members")]
    public async Task<ActionResult<TripResponse>> AddMember(Guid tripId, AddMemberRequest request)
    {
        var result = await _tripService.AddMemberAsync(tripId, this.GetUserId(), request);
        return Ok(result);
    }

    [HttpPost("{tripId:guid}/guests")]
    public async Task<ActionResult<TripResponse>> AddGuest(Guid tripId, AddGuestRequest request)
    {
        var result = await _tripService.AddGuestAsync(tripId, this.GetUserId(), request);
        return Ok(result);
    }

    // "join" as a literal path segment doesn't collide with GetTrip's
    // {tripId:guid} constraint — a code is never a valid Guid, and this is POST
    // while GetTrip is GET, so there's no ambiguity in routing either way.
    [HttpPost("join")]
    public async Task<ActionResult<TripResponse>> JoinByCode(JoinTripRequest request)
    {
        var result = await _tripService.JoinByCodeAsync(this.GetUserId(), request);
        return Ok(result);
    }

    [HttpDelete("{tripId:guid}")]
    public async Task<IActionResult> DeleteTrip(Guid tripId)
    {
        await _tripService.DeleteTripAsync(tripId, this.GetUserId());
        return NoContent();
    }

    // Public preview for a scanned QR / shared /join/{code} link (see
    // join/join-claim.ts). Deliberately [AllowAnonymous] — a brand-new visitor
    // may have no identity at all yet, and needs to see the trip name before
    // deciding how to continue (guest/login/register). Authentication
    // middleware still runs regardless of [AllowAnonymous] (that attribute only
    // skips the requirement, not the check), so a caller who already has a
    // valid JWT still gets User.Identity.IsAuthenticated == true here and
    // CallerMembership gets resolved. Two path segments ("join" + {code}) means
    // this can never collide with GetTrip's single-segment {tripId:guid} route
    // regardless of HTTP verb.
    [HttpGet("join/{code}")]
    [AllowAnonymous]
    public async Task<ActionResult<TripJoinPreviewResponse>> GetJoinPreview(string code)
    {
        Guid? callerId = User.Identity?.IsAuthenticated == true ? this.GetUserId() : null;
        var result = await _tripService.GetJoinPreviewAsync(code, callerId);
        return Ok(result);
    }

    // Requires an already-resolved identity — the frontend establishes one
    // (guest/login/register) before ever calling this (see join-claim.ts).
    [HttpPost("join/{code}/claim")]
    public async Task<ActionResult<TripResponse>> ClaimMember(string code, ClaimMemberRequest request)
    {
        var result = await _tripService.ClaimMemberAsync(code, this.GetUserId(), request);
        return Ok(result);
    }

    // Owner-only (enforced in TripService.RegenerateInviteTokenAsync too) —
    // see the "Regenerate code" button in trip-detail.html.
    [HttpPost("{tripId:guid}/invite-token/regenerate")]
    public async Task<ActionResult<TripResponse>> RegenerateInviteToken(Guid tripId)
    {
        var result = await _tripService.RegenerateInviteTokenAsync(tripId, this.GetUserId());
        return Ok(result);
    }
}
