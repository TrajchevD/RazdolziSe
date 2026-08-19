using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly IConfiguration _config;
    private readonly IEmailService _emailService;

    public AuthService(AppDbContext db, IPasswordHasher<User> passwordHasher, IConfiguration config, IEmailService emailService)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _config = config;
        _emailService = emailService;
    }

    // Deliberately minimal — this app doesn't need production-grade password policy,
    // just enough to stop empty/1-character passwords from being accepted.
    private const int MinPasswordLength = 6;
    // Shared by both the verify-email and forgot-password codes (see User.VerificationCode).
    private const int VerificationCodeExpiryMinutes = 15;
    // Deliberately much longer than the JWT's own Jwt:ExpiryMinutes (120) — this is
    // what actually keeps someone logged in for weeks on a phone without retyping a
    // password, the access token just quietly rotates underneath via /auth/refresh.
    private const int RefreshTokenExpiryDays = 30;

    // 6 digits, zero-padded — short enough to type on a phone keyboard, long enough
    // (1 in a million) that a 15-minute expiry window makes brute-forcing pointless.
    private static string GenerateVerificationCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    // Same "avoid characters people misread" exclusions (0/O, 1/I) as
    // TripService.JoinCodeAlphabet, duplicated rather than shared for the same
    // reason SettlementService/AppNotificationService each keep their own
    // Epsilon — small enough that a shared constants file isn't worth it yet.
    private static readonly char[] TagAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    private static string GenerateTag()
    {
        var bytes = RandomNumberGenerator.GetBytes(4);
        var chars = new char[4];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = TagAlphabet[bytes[i] % TagAlphabet.Length];
        }
        return new string(chars);
    }

    // Backfills User.Tag the same lazy way TripService.EnsureJoinCodeAsync
    // backfills Trip.JoinCode — called from BuildAuthResponseAsync so every
    // authenticated response (register/login/guest/link/verify/refresh) is a
    // chance to fill it in, with no migration needed for accounts that predate
    // this field. Unlike an 8-character JoinCode (24^8 combinations, effectively
    // collision-free), a 4-character Tag only has 24^4 (~332,000) combinations —
    // enough headroom for this app's realistic scale, but worth an explicit
    // bounded retry against the unique index rather than trusting a single
    // draw the way JoinCode's generator does.
    private async Task EnsureTagAsync(User user)
    {
        if (!string.IsNullOrEmpty(user.Tag))
        {
            return;
        }

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var candidate = GenerateTag();
            var taken = await _db.Users.AnyAsync(u => u.Tag == candidate);
            if (!taken)
            {
                user.Tag = candidate;
                await _db.SaveChangesAsync();
                return;
            }
        }

        // Astronomically unlikely to ever fall through 5 straight collisions at
        // this alphabet size — if it somehow does, the unique index still
        // guards against two users ending up with the same Tag; the save would
        // throw a DbUpdateException (handled generically by
        // ExceptionHandlingMiddleware) rather than silently corrupting data.
        user.Tag = GenerateTag();
        await _db.SaveChangesAsync();
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new InvalidOperationException("Email is required.");
        }
        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            throw new InvalidOperationException("Display name is required.");
        }
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < MinPasswordLength)
        {
            throw new InvalidOperationException($"Password must be at least {MinPasswordLength} characters.");
        }

        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email))
        {
            throw new InvalidOperationException("An account with this email already exists.");
        }

        var user = new User
        {
            Email = email,
            DisplayName = request.DisplayName.Trim(),
        };
        // PasswordHasher hashes with a per-call random salt, so identical passwords
        // never produce identical hashes — this is the same approach ASP.NET Core
        // Identity uses under the hood, without pulling in the full Identity system.
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return await BuildAuthResponseAsync(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Email == email);

        if (user is null || user.PasswordHash is null)
        {
            // Deliberately the same error as a wrong password, so a caller can't use
            // this endpoint to discover which emails have accounts. The PasswordHash
            // null check is belt-and-suspenders — a guest User row has no Email, so
            // it can never actually be found by the lookup above — but PasswordHash
            // is nullable now (see User.cs), so this keeps the compiler honest too.
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        return await BuildAuthResponseAsync(user);
    }

    public async Task<AuthResponse> GuestAsync(GuestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.DeviceId))
        {
            throw new InvalidOperationException("Device id is required.");
        }

        var deviceId = request.DeviceId.Trim();
        var user = await _db.Users.SingleOrDefaultAsync(u => u.DeviceId == deviceId);

        if (user is null)
        {
            // If the caller supplied a real name (e.g. the "Continue as Guest" name
            // prompt on the join-link screen — see join-claim.ts), use it. Otherwise
            // fall back to a short, human-readable default so multiple guests on a
            // shared trip are still distinguishable (avatar initials, "paid by"
            // tags) until they optionally set a real display name later.
            var suffix = Guid.NewGuid().ToString("N")[..4].ToUpperInvariant();
            var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
                ? $"Guest {suffix}"
                : request.DisplayName.Trim();
            user = new User
            {
                DeviceId = deviceId,
                DisplayName = displayName,
                IsGuest = true,
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        // If a user with this device id already exists, reuse it as-is — including
        // one who has since linked a real email/password (IsGuest now false). That
        // is intentional: it's what lets the same physical device stay signed in
        // indefinitely without retyping a password, exactly like a still-valid
        // token in local storage would — this endpoint is just another way to
        // obtain one.

        return await BuildAuthResponseAsync(user);
    }

    public async Task<AuthResponse> LinkAccountAsync(Guid userId, LinkAccountRequest request)
    {
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Id == userId)
            ?? throw new KeyNotFoundException("User not found.");

        // The whole point of this endpoint is turning a device-bound guest into a
        // portable account — a non-guest calling it again would just be a confusing
        // way to change their email, which isn't what this is for (no current-password
        // check here, since guests have none to prove).
        if (!user.IsGuest)
        {
            throw new InvalidOperationException("This account already has an email and password.");
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new InvalidOperationException("Email is required.");
        }
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < MinPasswordLength)
        {
            throw new InvalidOperationException($"Password must be at least {MinPasswordLength} characters.");
        }

        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email))
        {
            throw new InvalidOperationException("An account with this email already exists.");
        }

        // Set directly on the existing row — not a new User — so every trip/expense
        // already tied to this user's id (and DeviceId, left untouched) carries over
        // exactly as it was. This is the one thing that actually matters here.
        user.Email = email;
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        user.IsGuest = false;

        await _db.SaveChangesAsync();

        return await BuildAuthResponseAsync(user);
    }

    public async Task<string> SendVerificationAsync(Guid userId)
    {
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Id == userId)
            ?? throw new KeyNotFoundException("User not found.");

        if (user.Email is null)
        {
            // Can't happen through the normal UI (the banner only shows for linked
            // accounts), but a guest could still hit this endpoint directly.
            throw new InvalidOperationException("This account has no email yet — save your account first.");
        }
        if (user.IsEmailVerified)
        {
            throw new InvalidOperationException("This email is already verified.");
        }

        var code = GenerateVerificationCode();
        user.VerificationCode = code;
        user.VerificationCodeExpiresAt = DateTime.UtcNow.AddMinutes(VerificationCodeExpiryMinutes);
        await _db.SaveChangesAsync();

        await _emailService.SendAsync(
            user.Email,
            "Verify your RazdolziSe email",
            $"Your verification code is {code}. It expires in {VerificationCodeExpiryMinutes} minutes.");

        return code;
    }

    public async Task<AuthResponse> VerifyEmailAsync(Guid userId, VerifyEmailRequest request)
    {
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Id == userId)
            ?? throw new KeyNotFoundException("User not found.");

        if (!IsCodeValid(user, request.Code))
        {
            throw new InvalidOperationException("That code is invalid or has expired.");
        }

        user.IsEmailVerified = true;
        user.VerificationCode = null;
        user.VerificationCodeExpiresAt = null;
        await _db.SaveChangesAsync();

        return await BuildAuthResponseAsync(user);
    }

    public async Task<string?> ForgotPasswordAsync(ForgotPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return null;
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Email == email);

        // Deliberately silent no-op if no account matches — same "don't let a caller
        // use this to discover which emails have accounts" reasoning as LoginAsync's
        // generic error. The controller always returns the same response either way.
        if (user is null)
        {
            return null;
        }

        var code = GenerateVerificationCode();
        user.VerificationCode = code;
        user.VerificationCodeExpiresAt = DateTime.UtcNow.AddMinutes(VerificationCodeExpiryMinutes);
        await _db.SaveChangesAsync();

        await _emailService.SendAsync(
            user.Email!,
            "Reset your RazdolziSe password",
            $"Your password reset code is {code}. It expires in {VerificationCodeExpiryMinutes} minutes. " +
                "If you didn't request this, you can safely ignore this email.");

        return code;
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.NewPassword))
        {
            throw new InvalidOperationException("Email, code, and new password are all required.");
        }
        if (request.NewPassword.Length < MinPasswordLength)
        {
            throw new InvalidOperationException($"Password must be at least {MinPasswordLength} characters.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Email == email);

        // Same generic message whether the account doesn't exist or the code is
        // wrong/expired — this endpoint shouldn't be usable to probe which emails
        // have accounts any more than login/forgot-password already aren't.
        if (user is null || !IsCodeValid(user, request.Code))
        {
            throw new InvalidOperationException("That code is invalid or has expired.");
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);
        // Successfully using a code that was only ever sent to this email proves the
        // same "owns this inbox" fact verify-email does — no reason to make them
        // verify again separately right after this.
        user.IsEmailVerified = true;
        user.VerificationCode = null;
        user.VerificationCodeExpiresAt = null;
        await _db.SaveChangesAsync();
    }

    private static bool IsCodeValid(User user, string suppliedCode) =>
        user.VerificationCode is not null
        && user.VerificationCodeExpiresAt is not null
        && user.VerificationCodeExpiresAt >= DateTime.UtcNow
        && user.VerificationCode == suppliedCode.Trim();

    public async Task<AuthResponse> RefreshAsync(RefreshRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            throw new UnauthorizedAccessException("Invalid refresh token.");
        }

        var hash = HashToken(request.RefreshToken);
        var user = await _db.Users.SingleOrDefaultAsync(u => u.RefreshTokenHash == hash);

        if (user is null || user.RefreshTokenExpiresAt is null || user.RefreshTokenExpiresAt < DateTime.UtcNow)
        {
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");
        }

        // Rotation: BuildAuthResponseAsync always issues (and stores the hash of) a
        // brand-new refresh token, which overwrites this one — so a copy of the old
        // token that leaked somewhere can't be replayed after the legitimate client
        // has already refreshed past it.
        return await BuildAuthResponseAsync(user);
    }

    // SHA-256 hex digest — same defense-in-depth reasoning as PasswordHash: only the
    // hash is ever stored (see User.RefreshTokenHash), so a stolen database dump
    // doesn't hand out working refresh tokens, only a value that has to be matched
    // against, not replayed directly.
    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string GenerateRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private async Task<AuthResponse> BuildAuthResponseAsync(User user)
    {
        var jwtKey = _config["Jwt:Key"]!;
        var jwtIssuer = _config["Jwt:Issuer"]!;
        var jwtAudience = _config["Jwt:Audience"]!;
        // TryParse rather than Parse: a malformed config value should fall back to a
        // sane default, not crash every single login/register call at runtime.
        var expiryMinutes = int.TryParse(_config["Jwt:ExpiryMinutes"], out var parsedExpiry) ? parsedExpiry : 120;

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            // Claim's constructor rejects a null value — guests have no email, so
            // this falls back to an empty string rather than throwing.
            new Claim(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new Claim("displayName", user.DisplayName),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
            signingCredentials: creds
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        await EnsureTagAsync(user);

        // Long-lived refresh token so a 120-minute access-token expiry doesn't mean a
        // hard logout every couple hours on a phone — the frontend's HTTP interceptor
        // calls POST /api/auth/refresh on a 401 and retries transparently. Only the
        // hash is persisted (see HashToken); the raw value is returned exactly once,
        // right here, same as a password is only ever seen in plaintext at the moment
        // it's set.
        var refreshToken = GenerateRefreshToken();
        user.RefreshTokenHash = HashToken(refreshToken);
        user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenExpiryDays);
        await _db.SaveChangesAsync();

        return new AuthResponse(tokenString, refreshToken, user.Id, user.DisplayName, user.IsGuest, user.IsEmailVerified, user.Tag!);
    }
}
