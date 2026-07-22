namespace TripSplit.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Trip> OwnedTrips { get; set; } = new List<Trip>();
    public ICollection<TripMember> Memberships { get; set; } = new List<TripMember>();
}
