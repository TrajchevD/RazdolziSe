using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly IAppNotificationService _notificationService;

    public NotificationsController(IAppNotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    [HttpGet]
    public async Task<ActionResult<List<NotificationResponse>>> GetNotifications()
    {
        var result = await _notificationService.GetNotificationsAsync(this.GetUserId());
        return Ok(result);
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        await _notificationService.MarkReadAsync(this.GetUserId(), id);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _notificationService.DeleteAsync(this.GetUserId(), id);
        return NoContent();
    }
}
