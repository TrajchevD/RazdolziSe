using TripSplit.Api.Dtos;

namespace TripSplit.Api.Services;

public interface ITripService
{
    Task<TripResponse> CreateTripAsync(Guid ownerUserId, CreateTripRequest request);
    Task<List<TripResponse>> GetTripsForUserAsync(Guid userId);
    Task<TripResponse> GetTripAsync(Guid tripId, Guid requestingUserId);
    Task<TripResponse> AddMemberAsync(Guid tripId, Guid requestingUserId, AddMemberRequest request);
    Task<TripResponse> AddGuestAsync(Guid tripId, Guid requestingUserId, AddGuestRequest request);
    Task DeleteTripAsync(Guid tripId, Guid requestingUserId);
}
