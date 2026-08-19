namespace TripSplit.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    // Nullable now that guest accounts exist (see IsGuest) with neither — a guest
    // signs in via DeviceId alone until they optionally "save"/link an email +
    // password later (mobile identity work, phase 2).
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Per-device identifier a native app generates once and persists locally
    // (see mobile/frontend's DeviceIdService) so POST /api/auth/guest can find
    // and reuse the same guest — or later linked — identity across app restarts
    // without asking for credentials. Null for any account created through the
    // ordinary web/email register or login flow.
    public string? DeviceId { get; set; }
    // True until a guest links a real email + password (see the planned
    // POST /api/auth/link-account, phase 2). Anyone who registered normally is
    // never a guest. Distinct from a "guest trip member"
    // (TripMember.UserId == null — someone with no account at all added to one
    // trip): this flag is about the User row itself having no verified
    // credentials yet, not about trip membership.
    public bool IsGuest { get; set; }

    // False for every account until they complete the verify-email flow — including
    // pre-existing accounts from before this field existed, which is accurate: they
    // were never verified either. A false value never restricts anything (see
    // AuthController) — it only drives the Profile "verify your email" banner.
    public bool IsEmailVerified { get; set; }
    // Shared by both verify-email and forgot-password — same "prove you own this
    // inbox" primitive either way, so no need for two separate code fields. Null
    // when there's no pending code; set + cleared by AuthService's
    // SendVerificationAsync/ForgotPasswordAsync and VerifyEmailAsync/ResetPasswordAsync.
    public string? VerificationCode { get; set; }
    public DateTime? VerificationCodeExpiresAt { get; set; }

    // Refresh-token rotation (see AuthService.RefreshAsync/BuildAuthResponseAsync) —
    // only the SHA-256 hash is ever stored, never the raw token, same defense-in-depth
    // reasoning as PasswordHash: a stolen database dump shouldn't hand out working
    // sessions. Nullable because a user has none until their first
    // login/register/guest/etc call issues one.
    public string? RefreshTokenHash { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }

    // Discord-style identity: DisplayName is the "username" half (already
    // user-chosen, already shown everywhere — see TripMember.DisplayName's copy
    // from this), Tag is the "short ID" half that makes "DisplayName#Tag"
    // unique even when two people picked the same display name. Generated once,
    // lazily, the same nullable-then-backfilled pattern as Trip.JoinCode (see
    // AuthService.EnsureTagAsync, called from every BuildAuthResponseAsync) —
    // pre-existing accounts get one the next time they log in/refresh, no
    // migration needed.
    public string? Tag { get; set; }

    public ICollection<Trip> OwnedTrips { get; set; } = new List<Trip>();
    public ICollection<TripMember> Memberships { get; set; } = new List<TripMember>();
}
