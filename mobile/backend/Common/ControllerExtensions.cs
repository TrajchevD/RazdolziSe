using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Mvc;

namespace TripSplit.Api.Common;

public static class ControllerExtensions
{
    /// <summary>
    /// Reads the current user's id out of the JWT "sub" claim. Every trip-scoped
    /// endpoint uses this instead of trusting any user id the client might send in
    /// the request body — the token is the only source of truth for "who is this."
    /// </summary>
    public static Guid GetUserId(this ControllerBase controller)
    {
        var sub = controller.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? throw new UnauthorizedAccessException("Missing user identity.");

        // TryParse rather than Parse: a malformed "sub" claim should look like an auth
        // failure (401/403) to the caller, not an unhandled FormatException (500).
        return Guid.TryParse(sub, out var userId)
            ? userId
            : throw new UnauthorizedAccessException("Invalid user identity.");
    }
}
