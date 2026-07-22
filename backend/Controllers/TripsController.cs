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
}
