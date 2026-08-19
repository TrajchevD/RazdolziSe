using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

/// <summary>
/// Consent-based trip membership: sending an invite creates a TripInvite, not a
/// TripMember — the invitee has to accept before they're actually on the trip.
/// This is additive alongside TripService.AddMemberAsync (the original
/// instant-add-by-email flow), not a replacement for it — see
/// PRODUCTION_REVIEW.md / DESIGN_IMPLEMENTATION.md for why both exist for now.
/// </summary>
public class TripInviteService : ITripInviteService
{
    private readonly AppDbContext _db;
    private readonly IAppNotificationService _notificationService;

    public TripInviteService(AppDbContext db, IAppNotificationService notificationService)
    {
        _db = db;
        _notificationService = notificationService;
    }

    public async Task<TripInviteResponse> SendInviteAsync(Guid tripId, Guid requestingUserId, CreateInviteRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var requestingMember = trip.Members.SingleOrDefault(m => m.UserId == requestingUserId)
            ?? throw new UnauthorizedAccessException("You are not a member of this trip.");

        // Owner-only: matches MANUAL_TEST_CHECKLIST.md's documented behavior.
        // Membership alone used to be enough here, which let any member invite
        // people onto someone else's trip without the owner's say-so.
        if (trip.OwnerId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Only the trip owner can invite people.");
        }

        // Looked up by id, not email — the caller already resolved who to invite
        // via the Friends list or a Name#Tag search (see CreateInviteRequest's
        // own comment), so there's no email lookup step here at all.
        var userToInvite = await _db.Users.FindAsync(request.UserId)
            ?? throw new KeyNotFoundException("That account no longer exists.");

        if (userToInvite.Id == requestingUserId)
        {
            throw new InvalidOperationException("You can't invite yourself.");
        }

        if (trip.Members.Any(m => m.UserId == userToInvite.Id))
        {
            throw new InvalidOperationException("That person is already a member of this trip.");
        }

        // Proactive check (nicer error message) — the unique index on
        // (TripId, InvitedUserId) is still the real backstop against a race
        // between two simultaneous invite requests, same pattern AuthService's
        // email-exists check uses ahead of the Users.Email unique index.
        if (await _db.TripInvites.AnyAsync(i => i.TripId == tripId && i.InvitedUserId == userToInvite.Id))
        {
            throw new InvalidOperationException("An invite is already pending for that person.");
        }

        var invite = new TripInvite
        {
            TripId = tripId,
            InvitedUserId = userToInvite.Id,
            InvitedByTripMemberId = requestingMember.Id,
        };

        _db.TripInvites.Add(invite);
        await _db.SaveChangesAsync();

        // Best-effort, same "don't roll back a save that already succeeded" pattern
        // as SettlementService.RecordPaymentAsync's own notification call.
        try
        {
            await _notificationService.NotifyTripInviteAsync(invite, trip.Name, requestingMember.DisplayName);
        }
        catch
        {
            // Swallowed deliberately — see comment above.
        }

        return await MapToResponseAsync(invite.Id);
    }

    public async Task<List<TripInviteResponse>> GetMyInvitesAsync(Guid userId)
    {
        return await _db.TripInvites
            .Where(i => i.InvitedUserId == userId)
            .Include(i => i.Trip)
            .Include(i => i.InvitedByTripMember)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new TripInviteResponse(
                i.Id,
                i.TripId,
                i.Trip!.Name,
                // Always non-null: only a registered trip member (one with a
                // UserId) can ever be the sender — see the requestingMember
                // lookup in SendInviteAsync, which requires a UserId match.
                i.InvitedByTripMember!.UserId!.Value,
                i.InvitedByTripMember!.DisplayName,
                i.CreatedAt
            ))
            .ToListAsync();
    }

    public async Task AcceptInviteAsync(Guid inviteId, Guid userId)
    {
        var invite = await _db.TripInvites
            .Include(i => i.Trip!).ThenInclude(t => t.Members)
            .SingleOrDefaultAsync(i => i.Id == inviteId)
            ?? throw new KeyNotFoundException("Invite not found.");

        if (invite.InvitedUserId != userId)
        {
            throw new UnauthorizedAccessException("This invite isn't yours.");
        }

        // Edge case: they already ended up a member some other way between the
        // invite being sent and being accepted (e.g. someone else added them
        // directly via the existing add-member flow in the meantime). Treat
        // accepting as idempotent rather than erroring — just clear the
        // now-stale invite instead of trying to create a duplicate membership
        // the unique (TripId, UserId) index would reject anyway.
        if (invite.Trip!.Members.Any(m => m.UserId == userId))
        {
            _db.TripInvites.Remove(invite);
            await _db.SaveChangesAsync();
            return;
        }

        var invitedUser = await _db.Users.FindAsync(userId)
            ?? throw new UnauthorizedAccessException("Missing user identity.");

        _db.TripMembers.Add(new TripMember
        {
            TripId = invite.TripId,
            UserId = userId,
            DisplayName = invitedUser.DisplayName,
        });
        _db.TripInvites.Remove(invite);

        await _db.SaveChangesAsync();
    }

    public async Task DeclineInviteAsync(Guid inviteId, Guid userId)
    {
        var invite = await _db.TripInvites.SingleOrDefaultAsync(i => i.Id == inviteId)
            ?? throw new KeyNotFoundException("Invite not found.");

        if (invite.InvitedUserId != userId)
        {
            throw new UnauthorizedAccessException("This invite isn't yours.");
        }

        _db.TripInvites.Remove(invite);
        await _db.SaveChangesAsync();
    }

    private async Task<TripInviteResponse> MapToResponseAsync(Guid inviteId)
    {
        var invite = await _db.TripInvites
            .Include(i => i.Trip)
            .Include(i => i.InvitedByTripMember)
            .SingleAsync(i => i.Id == inviteId);

        return new TripInviteResponse(
            invite.Id,
            invite.TripId,
            invite.Trip!.Name,
            invite.InvitedByTripMember!.UserId!.Value,
            invite.InvitedByTripMember!.DisplayName,
            invite.CreatedAt
        );
    }
}
