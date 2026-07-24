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
            entity.Property(t => t.SettlementCurrency).HasMaxLength(3);

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
