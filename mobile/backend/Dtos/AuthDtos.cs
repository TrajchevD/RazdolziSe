namespace TripSplit.Api.Dtos;

public record RegisterRequest(string Email, string Password, string DisplayName);

public record LoginRequest(string Email, string Password);

// Client-generated device id (crypto.randomUUID(), persisted via
// @capacitor/preferences) — see AuthService.GuestAsync. DisplayName is optional
// and only ever used the first time a given device id is seen (a brand-new
// guest) — see AuthService.GuestAsync's null-user branch; a returning device is
// always reused as-is, so a DisplayName sent on a later call is silently
// ignored rather than renaming someone underneath them.
public record GuestRequest(string DeviceId, string? DisplayName = null);

// See AuthService.LinkAccountAsync — sets these on the caller's existing (guest)
// User row rather than creating a new one.
public record LinkAccountRequest(string Email, string Password);

// See AuthService.VerifyEmailAsync — Code is whatever SendVerificationAsync emailed
// the caller's own address (GetUserId() from the token, not a request field).
public record VerifyEmailRequest(string Code);

// See AuthService.ForgotPasswordAsync — anonymous, so the email has to be supplied
// (there's no token yet to look the user up from).
public record ForgotPasswordRequest(string Email);

// See AuthService.ResetPasswordAsync — same reasoning, plus the code it just emailed
// and the new password to set once that code checks out.
public record ResetPasswordRequest(string Email, string Code, string NewPassword);

// See AuthService.RefreshAsync — no [Authorize] on that endpoint, since the whole
// point is trading a still-valid refresh token for a new access token after the old
// access token has already expired.
public record RefreshRequest(string RefreshToken);

// IsGuest/IsEmailVerified let the frontend decide whether to show the "save your
// account" nudge (phase 2) and the "verify your email" banner (phase 3) without a
// separate call — every auth endpoint that returns a session includes both, plus a
// RefreshToken (phase 4) so the client can silently renew the session instead of
// forcing a re-login every time the 120-minute access token expires. Tag is the
// Discord-style "#XXXX" short id shown next to DisplayName (see User.Tag and
// AuthService.EnsureTagAsync) — lazily backfilled, so this is never actually null
// by the time a response leaves BuildAuthResponseAsync.
public record AuthResponse(string Token, string RefreshToken, Guid UserId, string DisplayName, bool IsGuest, bool IsEmailVerified, string Tag);
