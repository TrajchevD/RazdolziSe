using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class TripService : ITripService
{
    private readonly AppDbContext _db;

    public TripService(AppDbContext db)
    {
        _db = db;
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

        return MapToResponse(trip);
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

    private static void EnsureMember(Trip trip, Guid userId)
    {
        if (!trip.Members.Any(m => m.UserId == userId))
        {
            throw new UnauthorizedAccessException("You are not a member of this trip.");
        }
    }

    private static TripResponse MapToResponse(Trip trip) => new(
        trip.Id,
        trip.Name,
        trip.OwnerId,
        trip.CreatedAt,
        trip.SettlementCurrency,
        trip.Members.Select(m => new TripMemberResponse(m.Id, m.UserId, m.DisplayName)).ToList()
    );
}
