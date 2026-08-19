using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class TripService : ITripService
{
    private readonly AppDbContext _db;
    private readonly IAppNotificationService _notificationService;

    public TripService(AppDbContext db, IAppNotificationService notificationService)
    {
        _db = db;
        _notificationService = notificationService;
    }

    // Excludes 0/O and 1/I — the two pairs people misread most often when copying a
    // code off a screen or reading it aloud.
    private static readonly char[] JoinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    private static string GenerateJoinCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(8);
        var chars = new char[8];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = JoinCodeAlphabet[bytes[i] % JoinCodeAlphabet.Length];
        }
        return new string(chars);
    }

    public async Task<TripResponse> CreateTripAsync(Guid ownerUserId, CreateTripRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new InvalidOperationException("Trip name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.SettlementCurrency) || request.SettlementCurrency.Trim().Length != 3)
        {
            throw new InvalidOperationException("Settlement currency must be a 3-letter code (e.g. USD, EUR, MKD).");
        }

        var owner = await _db.Users.FindAsync(ownerUserId)
            ?? throw new UnauthorizedAccessException("Missing user identity.");

        var trip = new Trip
        {
            Name = request.Name.Trim(),
            SettlementCurrency = request.SettlementCurrency.Trim().ToUpperInvariant(),
            OwnerId = ownerUserId,
        };

        // The creator is automatically the first member — a trip always has at least one.
        trip.Members.Add(new TripMember
        {
            TripId = trip.Id,
            UserId = ownerUserId,
            DisplayName = owner.DisplayName,
        });

        _db.Trips.Add(trip);
        await _db.SaveChangesAsync();

        // GetTripAsync backfills JoinCode via EnsureJoinCodeAsync — no need to set it
        // here too, this is the only place that call happens for a brand-new trip.
        return await GetTripAsync(trip.Id, ownerUserId);
    }

    public async Task<List<TripResponse>> GetTripsForUserAsync(Guid userId)
    {
        var tripIds = await _db.TripMembers
            .Where(tm => tm.UserId == userId)
            .Select(tm => tm.TripId)
            .ToListAsync();

        var results = new List<TripResponse>();
        foreach (var tripId in tripIds)
        {
            results.Add(await GetTripAsync(tripId, userId));
        }
        return results;
    }

    public async Task<TripResponse> GetTripAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        EnsureMember(trip, requestingUserId);
        await EnsureJoinCodeAsync(trip);

        return MapToResponse(trip, requestingUserId);
    }

    // Backfills a code for trips created before join codes existed — a brand-new
    // trip already gets one here too, since CreateTripAsync's final step is a call
    // into this same method (see its comment).
    private async Task EnsureJoinCodeAsync(Trip trip)
    {
        if (!string.IsNullOrEmpty(trip.JoinCode))
        {
            return;
        }
        trip.JoinCode = GenerateJoinCode();
        await _db.SaveChangesAsync();
    }

    public async Task<TripResponse> AddMemberAsync(Guid tripId, Guid requestingUserId, AddMemberRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        EnsureMember(trip, requestingUserId);

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new InvalidOperationException("Email is required.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var userToAdd = await _db.Users.SingleOrDefaultAsync(u => u.Email == email)
            ?? throw new KeyNotFoundException("No account exists with that email yet — they need to register first.");

        if (trip.Members.Any(m => m.UserId == userToAdd.Id))
        {
            throw new InvalidOperationException("That person is already a member of this trip.");
        }

        _db.TripMembers.Add(new TripMember
        {
            TripId = tripId,
            UserId = userToAdd.Id,
            DisplayName = userToAdd.DisplayName,
        });
        await _db.SaveChangesAsync();

        return await GetTripAsync(tripId, requestingUserId);
    }

    public async Task<TripResponse> AddGuestAsync(Guid tripId, Guid requestingUserId, AddGuestRequest request)
    {
        var trip = await _db.Trips
            .Include(t => t.Members)
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        EnsureMember(trip, requestingUserId);

        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            throw new InvalidOperationException("Guest name is required.");
        }
        var displayName = request.DisplayName.Trim();

        // Guests never get a UserId — they're a TripMember with no account behind them.
        // The unique (TripId, UserId) index doesn't block this: SQL treats every NULL
        // as distinct, so any number of guests can coexist on one trip.
        _db.TripMembers.Add(new TripMember
        {
            TripId = tripId,
            UserId = null,
            DisplayName = displayName,
        });
        await _db.SaveChangesAsync();

        return await GetTripAsync(tripId, requestingUserId);
    }

    public async Task<TripResponse> JoinByCodeAsync(Guid userId, JoinTripRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            throw new InvalidOperationException("A trip code is required.");
        }

        var code = request.Code.Trim().ToUpperInvariant();

        // Up to 2 attempts: a genuine double-submit (double-tap, or the auth
        // interceptor's refresh-and-retry racing a second copy of this same
        // request — see auth.interceptor.ts) can have two requests both load
        // "not a member yet" before either commits its insert. The loser then
        // sees a 0-affected-rows concurrency exception on a plain INSERT (an
        // EF/Pomelo quirk this codebase otherwise has no concurrency tokens to
        // explain) or a unique-index violation — either way, reloading and
        // re-checking membership resolves it: if the other request's insert
        // already landed, this becomes the same idempotent no-op below instead
        // of a second attempt.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            // Deliberately NOT using .Include(t => t.Members) + a tracked collection
            // .Add() here — going through Trip.Members ties the new TripMember's
            // insert to the same tracked graph as the parent Trip, which is more
            // change-tracking surface than this needs. A direct existence check
            // plus a standalone TripMembers.Add() is simpler and doesn't touch the
            // Trip entity at all, so there's nothing for SaveChanges to get
            // confused about beyond the one row actually being written.
            var trip = await _db.Trips
                .AsNoTracking()
                .SingleOrDefaultAsync(t => t.JoinCode == code)
                ?? throw new KeyNotFoundException("No trip found with that code.");

            // Already a member (e.g. they joined earlier, re-scanned the same code,
            // or lost the race on a previous attempt of this same loop) — treat
            // this as a harmless no-op rather than an error, same reasoning as
            // TripInviteService.AcceptInviteAsync's idempotent-accept case.
            var alreadyMember = await _db.TripMembers.AsNoTracking()
                .AnyAsync(m => m.TripId == trip.Id && m.UserId == userId);
            if (alreadyMember)
            {
                return await GetTripAsync(trip.Id, userId);
            }

            var user = await _db.Users.FindAsync(userId)
                ?? throw new UnauthorizedAccessException("Missing user identity.");

            _db.TripMembers.Add(new TripMember
            {
                TripId = trip.Id,
                UserId = userId,
                DisplayName = user.DisplayName,
            });

            try
            {
                await _db.SaveChangesAsync();

                // Courtesy ping to the owner — same pattern as ClaimMemberAsync's own
                // call below. This path (plain "join by code" from trip-list, rather
                // than the /join/:code claim-a-name flow) previously skipped it
                // entirely, so the owner never heard about someone joining this way.
                if (trip.OwnerId != userId)
                {
                    await _notificationService.NotifyTripMemberJoinedAsync(trip, user.DisplayName);
                }

                return await GetTripAsync(trip.Id, userId);
            }
            catch (DbUpdateException) when (attempt == 0)
            {
                // Detach the failed insert so the next loop iteration starts from
                // a clean change tracker instead of retrying the same doomed entry.
                _db.ChangeTracker.Clear();
            }
        }

        // Should be unreachable — the second attempt either succeeds, returns via
        // the "already a member" branch, or throws for real (propagating out is
        // correct at that point: two straight failures means something other than
        // a simple double-submit race).
        throw new InvalidOperationException("Could not join this trip — please try again.");
    }

    public async Task DeleteTripAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (trip.OwnerId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Only the trip owner can delete this trip.");
        }

        // Deleted bottom-up, explicitly, rather than just removing the Trip and letting
        // the database cascade handle the rest. TripMember is referenced by
        // Expense.PaidByTripMemberId, ExpenseShare.TripMemberId,
        // Payment.From/ToTripMemberId, and TripInvite.InvitedByTripMemberId, all with
        // RESTRICT (not cascade) foreign keys — and TripMember itself cascades directly
        // from Trip. If the database processed that TripMember cascade before finishing
        // the other cascades (all triggered by the same single DELETE), the RESTRICT
        // constraints could reject it with a foreign key violation. Deleting every
        // dependent table in dependency order first removes that ambiguity entirely —
        // by the time TripMember rows are deleted, nothing else references them anymore.
        await using var transaction = await _db.Database.BeginTransactionAsync();

        var expenseIds = await _db.Expenses.Where(e => e.TripId == tripId).Select(e => e.Id).ToListAsync();
        await _db.ExpenseShares.Where(s => expenseIds.Contains(s.ExpenseId)).ExecuteDeleteAsync();
        await _db.Expenses.Where(e => e.TripId == tripId).ExecuteDeleteAsync();
        await _db.Payments.Where(p => p.TripId == tripId).ExecuteDeleteAsync();
        // TripInvite.TripId also cascades from Trip directly (same shape as
        // TripMember), so it needs the same explicit up-front delete for the same
        // reason — otherwise it's a second table racing TripMember's cascade for
        // the same underlying ambiguity.
        await _db.TripInvites.Where(i => i.TripId == tripId).ExecuteDeleteAsync();
        // AppNotification.TripId is Restrict for the same reason as TripInvite
        // above (see AppDbContext) — it also cascades from Trip directly, so it
        // needs the same explicit up-front delete.
        await _db.AppNotifications.Where(n => n.TripId == tripId).ExecuteDeleteAsync();
        await _db.TripMembers.Where(m => m.TripId == tripId).ExecuteDeleteAsync();

        _db.Trips.Remove(trip);
        await _db.SaveChangesAsync();

        await transaction.CommitAsync();
    }

    private static void EnsureMember(Trip trip, Guid userId)
    {
        if (!trip.Members.Any(m => m.UserId == userId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }
    }

    private static TripResponse MapToResponse(Trip trip, Guid requestingUserId) => new(
        trip.Id,
        trip.Name,
        trip.OwnerId,
        trip.CreatedAt,
        trip.SettlementCurrency,
        // Every caller that can reach here has already gone through GetTripAsync
        // (which backfills it) or found the trip BY its code in JoinByCodeAsync — the
        // empty-string fallback is just defensive, it should never actually trigger.
        trip.JoinCode ?? string.Empty,
        !string.IsNullOrEmpty(trip.JoinCode),
        trip.OwnerId == requestingUserId ? "Owner" : "Member",
        trip.Members.Select(m => new TripMemberResponse(m.Id, m.UserId, m.DisplayName)).ToList()
    );

    private static string NormalizeCode(string joinCode)
    {
        if (string.IsNullOrWhiteSpace(joinCode))
        {
            throw new KeyNotFoundException("No trip found with that code.");
        }
        return joinCode.Trim().ToUpperInvariant();
    }

    public async Task<TripJoinPreviewResponse> GetJoinPreviewAsync(string joinCode, Guid? requestingUserId)
    {
        var code = NormalizeCode(joinCode);

        var trip = await _db.Trips
            .Include(t => t.Members)
            .AsNoTracking()
            .SingleOrDefaultAsync(t => t.JoinCode == code)
            ?? throw new KeyNotFoundException("No trip found with that code.");

        var unclaimed = trip.Members
            .Where(m => m.UserId == null)
            .Select(m => new TripMemberResponse(m.Id, m.UserId, m.DisplayName))
            .ToList();

        TripMemberResponse? callerMembership = null;
        if (requestingUserId is Guid callerId)
        {
            var mine = trip.Members.SingleOrDefault(m => m.UserId == callerId);
            if (mine is not null)
            {
                callerMembership = new TripMemberResponse(mine.Id, mine.UserId, mine.DisplayName);
            }
        }

        return new TripJoinPreviewResponse(trip.Id, trip.Name, trip.SettlementCurrency, unclaimed, callerMembership);
    }

    public async Task<TripResponse> ClaimMemberAsync(string joinCode, Guid requestingUserId, ClaimMemberRequest request)
    {
        var code = NormalizeCode(joinCode);

        var hasSlot = request.TripMemberId is not null;
        var hasNewName = !string.IsNullOrWhiteSpace(request.NewDisplayName);
        if (hasSlot == hasNewName)
        {
            throw new InvalidOperationException("Pick a name from the list, or enter your own — not both, not neither.");
        }

        // Same double-submit/race reasoning as JoinByCodeAsync above (this is the
        // same "self-add under the caller's own identity" write, just reached via
        // a code+picker instead of a bare code) — up to 2 attempts, reload and
        // re-check on the first failure instead of retrying blind.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var trip = await _db.Trips
                .Include(t => t.Members)
                .SingleOrDefaultAsync(t => t.JoinCode == code)
                ?? throw new KeyNotFoundException("No trip found with that code.");

            // Already a member (re-opened the same link, or lost/won a previous
            // attempt of this same loop) — idempotent no-op.
            if (trip.Members.Any(m => m.UserId == requestingUserId))
            {
                return await GetTripAsync(trip.Id, requestingUserId);
            }

            var user = await _db.Users.FindAsync(requestingUserId)
                ?? throw new UnauthorizedAccessException("Missing user identity.");

            // Captured before the branch below so both the slot-claim and
            // self-add paths can pass the same value to the owner notification
            // after SaveChanges succeeds.
            string joinedDisplayName;

            if (request.TripMemberId is Guid slotId)
            {
                var slot = trip.Members.SingleOrDefault(m => m.Id == slotId)
                    ?? throw new KeyNotFoundException("That name is no longer available.");
                if (slot.UserId is not null)
                {
                    // Someone else claimed this exact slot between the picker
                    // loading and this request landing — a plain 400 (not the 409
                    // a true DB-level race gets below) since this is caught by an
                    // in-memory check, not a failed write; the frontend's error
                    // handler shows the same message either way (see
                    // join-claim.ts's claim()), it just won't auto-refresh the
                    // picker for this specific case.
                    throw new InvalidOperationException("Someone just claimed that spot — pick another name or refresh.");
                }
                slot.UserId = requestingUserId;
                slot.DisplayName = user.DisplayName;
                joinedDisplayName = user.DisplayName;
            }
            else
            {
                // _db.TripMembers.Add(...) directly — matches AddMemberAsync/
                // AddGuestAsync/JoinByCodeAsync's exact insert pattern elsewhere in
                // this file. trip.Members.Add(...) (adding through the navigation
                // collection of an already-tracked, previously-*queried* Trip —
                // different from CreateTripAsync's case, where the Trip itself is
                // also brand-new in the same SaveChanges call) was producing a
                // spurious DbUpdateConcurrencyException from Pomelo on every self-add
                // claim, not just under a genuine double-submit race. EF still fixes
                // up the Trip navigation on this new row automatically via the
                // matching TripId FK against the already-tracked trip entity, so
                // the GetTripAsync call below still sees it.
                joinedDisplayName = request.NewDisplayName!.Trim();
                _db.TripMembers.Add(new TripMember
                {
                    TripId = trip.Id,
                    UserId = requestingUserId,
                    DisplayName = joinedDisplayName,
                });
            }

            try
            {
                await _db.SaveChangesAsync();

                // Courtesy ping to the owner — same unguarded call pattern as
                // TripInviteService.SendInviteAsync's NotifyTripInviteAsync call;
                // the join row above is already committed by this point regardless.
                if (trip.OwnerId != requestingUserId)
                {
                    await _notificationService.NotifyTripMemberJoinedAsync(trip, joinedDisplayName);
                }

                return await GetTripAsync(trip.Id, requestingUserId);
            }
            catch (DbUpdateException) when (attempt == 0)
            {
                _db.ChangeTracker.Clear();
            }
        }

        throw new InvalidOperationException("Could not join this trip — please try again.");
    }

    public async Task<TripResponse> RegenerateInviteTokenAsync(Guid tripId, Guid requestingUserId)
    {
        var trip = await _db.Trips
            .SingleOrDefaultAsync(t => t.Id == tripId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (trip.OwnerId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Only the trip owner can regenerate the join code.");
        }

        trip.JoinCode = GenerateJoinCode();
        await _db.SaveChangesAsync();

        return await GetTripAsync(tripId, requestingUserId);
    }
}
