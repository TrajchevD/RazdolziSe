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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            // MySQL/TiDB can't put a unique index on an unbounded text column
            // ("BLOB/TEXT column used in key specification without a key length") —
            // unlike SQL Server's nvarchar(max), which allowed this. 320 is the
            // maximum valid email length per RFC 5321/5322.
            entity.Property(u => u.Email).HasMaxLength(320);
            entity.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Trip>(entity =>
        {
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
    }
}
