using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Models;

namespace TripSplit.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<TripMember> TripMembers => Set<TripMember>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ExpenseShare> ExpenseShares => Set<ExpenseShare>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<TripInvite> TripInvites => Set<TripInvite>();
    public DbSet<AppNotification> AppNotifications => Set<AppNotification>();
    public DbSet<Friendship> Friendships => Set<Friendship>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            // MySQL/TiDB can't put a unique index on an unbounded text column
            // ("BLOB/TEXT column used in key specification without a key length") —
            // unlike SQL Server's nvarchar(max), which allowed this. 320 is the
            // maximum valid email length per RFC 5321/5322. Nullable now (guest
            // accounts have no email) — same NULL-is-never-equal-to-NULL reasoning
            // as TripMember's (TripId, UserId) index below lets any number of
            // guests coexist without tripping the unique constraint.
            entity.Property(u => u.Email).HasMaxLength(320);
            entity.HasIndex(u => u.Email).IsUnique();

            // UUIDs generated client-side (crypto.randomUUID(), 36 chars) — 64 is
            // headroom, not a real limit. Nullable + unique: web-registered
            // accounts have no device id (any number of NULLs coexist fine), but
            // a device that does have one can only ever map to one user row.
            entity.Property(u => u.DeviceId).HasMaxLength(64);
            entity.HasIndex(u => u.DeviceId).IsUnique();

            // 6-digit numeric code (see AuthService.GenerateVerificationCode) — 8 is
            // headroom, not a real limit. No index: it's looked up by user id/email,
            // never queried by code value directly.
            entity.Property(u => u.VerificationCode).HasMaxLength(8);

            // SHA-256 hex digest is always exactly 64 characters. Indexed (not
            // unique — a hash collision is cryptographically implausible, not
            // worth a constraint) since RefreshAsync looks a user up BY this value.
            entity.Property(u => u.RefreshTokenHash).HasMaxLength(64);
            entity.HasIndex(u => u.RefreshTokenHash);

            // 4 characters from AuthService.GenerateTag's alphabet. Nullable +
            // unique, same "any number of NULLs coexist fine" reasoning as
            // DeviceId/JoinCode above — accounts that predate this feature just
            // don't have one until their next BuildAuthResponseAsync call.
            entity.Property(u => u.Tag).HasMaxLength(4);
            entity.HasIndex(u => u.Tag).IsUnique();
        });

        modelBuilder.Entity<Trip>(entity =>
        {
            entity.Property(t => t.SettlementCurrency).HasMaxLength(3);

            // 8 characters from GenerateJoinCode's alphabet — nullable + unique, same
            // "any number of NULLs coexist fine" reasoning as User.DeviceId, so
            // pre-existing trips without a code yet don't collide with each other.
            entity.Property(t => t.JoinCode).HasMaxLength(8);
            entity.HasIndex(t => t.JoinCode).IsUnique();

            entity.HasOne(t => t.Owner)
                  .WithMany(u => u.OwnedTrips)
                  .HasForeignKey(t => t.OwnerId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TripMember>(entity =>
        {
            // A registered user can only appear once as a member of the same trip.
            // Guests (UserId == null) are exempt from this by ordinary SQL semantics —
            // NULL is never considered equal to another NULL in a unique index, so
            // any number of guests can coexist on one trip without a real user_id.
            entity.HasIndex(tm => new { tm.TripId, tm.UserId }).IsUnique();

            entity.HasOne(tm => tm.Trip)
                  .WithMany(t => t.Members)
                  .HasForeignKey(tm => tm.TripId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(tm => tm.User)
                  .WithMany(u => u.Memberships)
                  .HasForeignKey(tm => tm.UserId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Expense>(entity =>
        {
            entity.Property(e => e.Amount).HasColumnType("decimal(18,2)");
            entity.Property(e => e.OriginalAmount).HasColumnType("decimal(18,2)");
            // Needs more than 2 decimal places — exchange rates like USD->EUR (e.g.
            // 0.876364) would get rounded down to 0.88 and throw off every converted
            // amount if this used the same decimal(18,2) as the money columns above.
            entity.Property(e => e.ExchangeRate).HasColumnType("decimal(18,6)");
            entity.Property(e => e.Currency).HasMaxLength(3);

            entity.HasOne(e => e.Trip)
                  .WithMany(t => t.Expenses)
                  .HasForeignKey(e => e.TripId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.PaidBy)
                  .WithMany()
                  .HasForeignKey(e => e.PaidByTripMemberId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ExpenseShare>(entity =>
        {
            entity.Property(s => s.AmountOwed).HasColumnType("decimal(18,2)");

            entity.HasOne(s => s.Expense)
                  .WithMany(e => e.Shares)
                  .HasForeignKey(s => s.ExpenseId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.TripMember)
                  .WithMany()
                  .HasForeignKey(s => s.TripMemberId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.Property(p => p.Amount).HasColumnType("decimal(18,2)");

            entity.HasOne(p => p.Trip)
                  .WithMany(t => t.Payments)
                  .HasForeignKey(p => p.TripId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.FromTripMember)
                  .WithMany()
                  .HasForeignKey(p => p.FromTripMemberId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.ToTripMember)
                  .WithMany()
                  .HasForeignKey(p => p.ToTripMemberId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TripInvite>(entity =>
        {
            // One pending invite per (trip, invitee) at a time — sending a second
            // invite to someone who already has one pending throws the same clean
            // 409 Conflict every other unique-index violation in this app does
            // (see ExceptionHandlingMiddleware's DbUpdateException case), rather
            // than silently creating a duplicate.
            entity.HasIndex(i => new { i.TripId, i.InvitedUserId }).IsUnique();

            entity.HasOne(i => i.Trip)
                  .WithMany()
                  .HasForeignKey(i => i.TripId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(i => i.InvitedUser)
                  .WithMany()
                  .HasForeignKey(i => i.InvitedUserId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Restrict (not cascade) — same reasoning as Expense.PaidBy and
            // Payment.From/ToTripMember: TripInvite -> TripMember and Trip ->
            // TripMember are two independent cascade paths from the same Trip
            // delete, and letting both cascade at once risks the same FK-ordering
            // conflict TripService.DeleteTripAsync's comment already explains for
            // expenses/payments. TripInvite rows are short-lived (deleted on
            // accept/decline well before anyone deletes a trip) so this is mostly
            // theoretical, but consistent with how every other table here handles it.
            entity.HasOne(i => i.InvitedByTripMember)
                  .WithMany()
                  .HasForeignKey(i => i.InvitedByTripMemberId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AppNotification>(entity =>
        {
            // Every fetch is "give me this user's notifications, newest first" —
            // see AppNotificationService.GetNotificationsAsync.
            entity.HasIndex(n => new { n.UserId, n.CreatedAt });
            entity.Property(n => n.Type).HasMaxLength(32);

            entity.HasOne(n => n.User)
                  .WithMany()
                  .HasForeignKey(n => n.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Restrict, not cascade — same FK-ordering reasoning as
            // Expense/Payment/TripInvite's own Trip relationships (see
            // TripInvite's comment above): AppNotification is one more
            // independent cascade path off Trip, and letting two cascade paths
            // race from the same delete is what that comment already warns about.
            // IsRequired(false) since TripId is nullable now (see AppNotification.cs) —
            // only PaymentReceived rows have one.
            entity.HasOne(n => n.Trip)
                  .WithMany()
                  .HasForeignKey(n => n.TripId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Friendship>(entity =>
        {
            // Prevents the exact-same-direction duplicate (A requests B twice) —
            // it does NOT catch A/B requesting each other in opposite directions
            // at once, which FriendService.SendRequestAsync checks explicitly in
            // application code (and turns into an instant-accept rather than an
            // error, see that method's comment) since a composite "unordered
            // pair" unique index isn't something EF's fluent API expresses
            // directly without a raw SQL computed column.
            entity.HasIndex(f => new { f.RequesterId, f.AddresseeId }).IsUnique();

            // Both queried constantly in isolation (GetFriendsAsync ORs across
            // both, GetIncoming/OutgoingRequestsAsync filter on one at a time).
            entity.HasIndex(f => f.RequesterId);
            entity.HasIndex(f => f.AddresseeId);

            // Restrict on both sides — a user can't be deleted (there's no
            // account-deletion feature yet) while friendship rows reference
            // them, same conservative default as Expense.PaidBy/Payment's
            // TripMember FKs. Two FKs from Friendship to the same Users table
            // both need distinct navigation properties (Requester/Addressee),
            // which is why these two are spelled out instead of relying on
            // convention the way most other relationships in this file do.
            entity.HasOne(f => f.Requester)
                  .WithMany()
                  .HasForeignKey(f => f.RequesterId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(f => f.Addressee)
                  .WithMany()
                  .HasForeignKey(f => f.AddresseeId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // Pomelo defaults every Guid column to char(36) with collation
        // "ascii_general_ci". TiDB's collation framework doesn't support that
        // specific collation ("Unsupported collation when new collation is
        // enabled") even though it's a completely standard MySQL collation —
        // only ascii_bin and a handful of others are allowed. Switching every
        // Guid/Guid? column (every Id and every foreign key in this schema) to
        // ascii_bin fixes it and changes nothing behaviorally: .NET always
        // formats Guids the same consistent lowercase-hex way, so the
        // case-insensitivity ascii_general_ci would have provided was never
        // actually used.
        foreach (var property in modelBuilder.Model.GetEntityTypes()
                     .SelectMany(e => e.GetProperties())
                     .Where(p => p.ClrType == typeof(Guid) || p.ClrType == typeof(Guid?)))
        {
            property.SetCollation("ascii_bin");
        }
    }
}
