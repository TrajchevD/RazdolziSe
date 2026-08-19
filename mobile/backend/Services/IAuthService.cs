using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> GuestAsync(GuestRequest request);
    Task<AuthResponse> LinkAccountAsync(Guid userId, LinkAccountRequest request);

    // Returns the generated code so the controller can echo it back as a dev-only
    // convenience (see AuthController) — never exposed outside Development.
    Task<string> SendVerificationAsync(Guid userId);
    Task<AuthResponse> VerifyEmailAsync(Guid userId, VerifyEmailRequest request);

    // Returns null if no account matches the email — the controller always responds
    // the same way either way (see ForgotPassword), this is only for the same
    // dev-only debug echo as SendVerificationAsync.
    Task<string?> ForgotPasswordAsync(ForgotPasswordRequest request);
    Task ResetPasswordAsync(ResetPasswordRequest request);

    Task<AuthResponse> RefreshAsync(RefreshRequest request);
}
