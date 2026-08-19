using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripSplit.Api.Common;
using TripSplit.Api.Dtos;
using TripSplit.Api.Services;

namespace TripSplit.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IWebHostEnvironment _environment;

    public AuthController(IAuthService authService, IWebHostEnvironment environment)
    {
        _authService = authService;
        _environment = environment;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var response = await _authService.RegisterAsync(request);
        return Ok(response);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var response = await _authService.LoginAsync(request);
        return Ok(response);
    }

    // No [Authorize] — this is how a native app gets its *first* token, so there's
    // nothing to authenticate against yet. No email/password/verification required;
    // see AuthService.GuestAsync for how the device id maps to a User row.
    [HttpPost("guest")]
    public async Task<ActionResult<AuthResponse>> Guest(GuestRequest request)
    {
        var response = await _authService.GuestAsync(request);
        return Ok(response);
    }

    // Requires a valid token (from register/login/guest) — this turns the caller's
    // own guest identity into a portable one, so there's no meaningful anonymous
    // call shape for it the way register/login/guest have.
    [Authorize]
    [HttpPost("link-account")]
    public async Task<ActionResult<AuthResponse>> LinkAccount(LinkAccountRequest request)
    {
        var response = await _authService.LinkAccountAsync(this.GetUserId(), request);
        return Ok(response);
    }

    [Authorize]
    [HttpPost("send-verification")]
    public async Task<IActionResult> SendVerification()
    {
        var code = await _authService.SendVerificationAsync(this.GetUserId());
        return Ok(DebugCodeResponse("Verification code sent.", code));
    }

    [Authorize]
    [HttpPost("verify-email")]
    public async Task<ActionResult<AuthResponse>> VerifyEmail(VerifyEmailRequest request)
    {
        var response = await _authService.VerifyEmailAsync(this.GetUserId(), request);
        return Ok(response);
    }

    // No [Authorize] — recovering a forgotten password can't require being logged in.
    // Always returns the same message whether or not the email has an account (see
    // AuthService.ForgotPasswordAsync) so this can't be used to discover which emails
    // are registered.
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var code = await _authService.ForgotPasswordAsync(request);
        return Ok(DebugCodeResponse("If an account exists with that email, a reset code has been sent.", code));
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        await _authService.ResetPasswordAsync(request);
        return Ok(new { message = "Password reset — you can log in with your new password now." });
    }

    // No [Authorize] — the access token has typically already expired by the time
    // this is called (that's the whole reason to call it); the refresh token itself
    // is what's being authenticated here, not a bearer header.
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request)
    {
        var response = await _authService.RefreshAsync(request);
        return Ok(response);
    }

    // debugCode is only ever included outside Production (Render always sets
    // ASPNETCORE_ENVIRONMENT=Production — see DEPLOYMENT_GUIDE.md — so this never
    // ships to real users). Without real Gmail SMTP credentials configured yet,
    // GmailSmtpEmailService logs the code instead of emailing it; this does the same
    // thing in the response itself so the whole verify/reset flow is testable via
    // Swagger or the app without needing either real email or terminal access.
    private object DebugCodeResponse(string message, string? code)
    {
        if (_environment.IsDevelopment() && code is not null)
        {
            return new { message, debugCode = code };
        }
        return new { message };
    }
}
