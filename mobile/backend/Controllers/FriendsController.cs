using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/friends")]
public class FriendsController : ControllerBase
{
    private readonly IFriendService _friendService;

    public FriendsController(IFriendService friendService)
    {
        _friendService = friendService;
    }

    [HttpGet]
    public async Task<ActionResult<List<FriendResponse>>> GetFriends()
    {
        var result = await _friendService.GetFriendsAsync(this.GetUserId());
        return Ok(result);
    }

    [HttpGet("requests/incoming")]
    public async Task<ActionResult<List<FriendRequestResponse>>> GetIncomingRequests()
    {
        var result = await _friendService.GetIncomingRequestsAsync(this.GetUserId());
        return Ok(result);
    }

    [HttpGet("requests/outgoing")]
    public async Task<ActionResult<List<FriendRequestResponse>>> GetOutgoingRequests()
    {
        var result = await _friendService.GetOutgoingRequestsAsync(this.GetUserId());
        return Ok(result);
    }

    // POST (not GET) despite being a read — the query can contain characters
    // (#) that are awkward in a URL, and this never mutates anything, so a body
    // is simpler than fighting query-string encoding for one field.
    [HttpPost("search")]
    public async Task<ActionResult<UserSummaryResponse>> Search(SearchUserRequest request)
    {
        var result = await _friendService.SearchAsync(this.GetUserId(), request.Query);
        return Ok(result);
    }

    [HttpPost("requests")]
    public async Task<ActionResult<FriendRequestResponse>> SendRequest(SendFriendRequestRequest request)
    {
        var result = await _friendService.SendRequestAsync(this.GetUserId(), request.UserId);
        return Ok(result);
    }

    [HttpPost("requests/{id:guid}/accept")]
    public async Task<ActionResult<FriendResponse>> AcceptRequest(Guid id)
    {
        var result = await _friendService.AcceptRequestAsync(this.GetUserId(), id);
        return Ok(result);
    }

    [HttpPost("requests/{id:guid}/decline")]
    public async Task<IActionResult> DeclineRequest(Guid id)
    {
        await _friendService.DeclineRequestAsync(this.GetUserId(), id);
        return NoContent();
    }

    [HttpDelete("{userId:guid}")]
    public async Task<IActionResult> RemoveFriend(Guid userId)
    {
        await _friendService.RemoveFriendAsync(this.GetUserId(), userId);
        return NoContent();
    }
}
