using Microsoft.EntityFrameworkCore;
using TripSplit.Api.Data;
using TripSplit.Api.Dtos;
using TripSplit.Api.Models;

namespace TripSplit.Api.Services;

public class FriendService : IFriendService
{
    private readonly AppDbContext _db;
    private readonly IAppNotificationService _notificationService;

    public FriendService(AppDbContext db, IAppNotificationService notificationService)
    {
        _db = db;
        _notificationService = notificationService;
    }

    public async Task<UserSummaryResponse> SearchAsync(Guid requestingUserId, string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            throw new InvalidOperationException("Enter a name and tag to search, e.g. Alex#7Q2K.");
        }

        var trimmed = query.Trim();
        var hashIndex = trimmed.LastIndexOf('#');

        // Also rejects a trailing "#" with nothing after it — hashIndex would be
        // the last character, and the tag slice below would come out empty.
        if (hashIndex <= 0 || hashIndex == trimmed.Length - 1)
        {
            throw new InvalidOperationException("Search using Name#TAG — the # and tag from their profile.");
        }

        var name = trimmed[..hashIndex].Trim();
        var tag = trimmed[(hashIndex + 1)..].Trim().ToUpperInvariant();

        if (name.Length == 0 || tag.Length == 0)
        {
            throw new InvalidOperationException("Search using Name#TAG — the # and tag from their profile.");
        }

        // DisplayName isn't unique on its own (see User.Tag's own comment) — Tag
        // narrows it back down to exactly one account, same pairing the profile
        // screen displays. Case-insensitive on the name half only; Tag is always
        // generated uppercase (see AuthService.GenerateTag), so the query is
        // upper-cased above rather than doing a second case-insensitive compare.
        var nameLower = name.ToLowerInvariant();
        var user = await _db.Users
            .SingleOrDefaultAsync(u => u.Tag == tag && u.DisplayName.ToLower() == nameLower)
            ?? throw new KeyNotFoundException("No one found with that name and tag.");

        if (user.Id == requestingUserId)
        {
            throw new InvalidOperationException("That's you.");
        }

        return new UserSummaryResponse(user.Id, user.DisplayName, user.Tag ?? string.Empty);
    }

    public async Task<FriendRequestResponse> SendRequestAsync(Guid requestingUserId, Guid targetUserId)
    {
        if (targetUserId == requestingUserId)
        {
            throw new InvalidOperationException("You can't friend yourself.");
        }

        var targetUser = await _db.Users.FindAsync(targetUserId)
            ?? throw new KeyNotFoundException("User not found.");

        var existing = await _db.Friendships.SingleOrDefaultAsync(f =>
            (f.RequesterId == requestingUserId && f.AddresseeId == targetUserId) ||
            (f.RequesterId == targetUserId && f.AddresseeId == requestingUserId));

        if (existing is not null)
        {
            if (existing.Status == FriendshipStatus.Accepted)
            {
                throw new InvalidOperationException("You're already friends.");
            }

            // They already sent one to us — treat "add" as an instant accept
            // instead of erroring or creating a redundant second pending row in
            // the opposite direction. Matches how most friend-request UIs behave
            // when you try to add someone who already asked you.
            if (existing.RequesterId == targetUserId)
            {
                existing.Status = FriendshipStatus.Accepted;
                existing.RespondedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                await _notificationService.NotifyFriendRequestAcceptedAsync(existing);

                return new FriendRequestResponse(existing.Id, targetUserId, targetUser.DisplayName, targetUser.Tag ?? string.Empty, existing.CreatedAt);
            }

            throw new InvalidOperationException("A friend request is already pending.");
        }

        var friendship = new Friendship { RequesterId = requestingUserId, AddresseeId = targetUserId };
        _db.Friendships.Add(friendship);
        await _db.SaveChangesAsync();

        await _notificationService.NotifyFriendRequestAsync(friendship);

        return new FriendRequestResponse(friendship.Id, targetUserId, targetUser.DisplayName, targetUser.Tag ?? string.Empty, friendship.CreatedAt);
    }

    public async Task<FriendResponse> AcceptRequestAsync(Guid userId, Guid friendshipId)
    {
        var friendship = await _db.Friendships.SingleOrDefaultAsync(f => f.Id == friendshipId)
            ?? throw new KeyNotFoundException("Friend request not found.");

        if (friendship.AddresseeId != userId)
        {
            throw new UnauthorizedAccessException("This request wasn't sent to you.");
        }

        if (friendship.Status == FriendshipStatus.Accepted)
        {
            throw new InvalidOperationException("Already accepted.");
        }

        friendship.Status = FriendshipStatus.Accepted;
        friendship.RespondedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notificationService.NotifyFriendRequestAcceptedAsync(friendship);

        var requester = await _db.Users.SingleAsync(u => u.Id == friendship.RequesterId);
        return new FriendResponse(requester.Id, requester.DisplayName, requester.Tag ?? string.Empty);
    }

    public async Task DeclineRequestAsync(Guid userId, Guid friendshipId)
    {
        var friendship = await _db.Friendships.SingleOrDefaultAsync(f => f.Id == friendshipId)
            ?? throw new KeyNotFoundException("Friend request not found.");

        // Either side can make a pending request go away — the addressee
        // declining it, or the requester cancelling one they no longer want
        // pending. Only meaningful while Pending; an Accepted friendship goes
        // through RemoveFriendAsync instead, which is intentionally a separate,
        // more explicit action ("unfriend" vs. "decline").
        if (friendship.AddresseeId != userId && friendship.RequesterId != userId)
        {
            throw new UnauthorizedAccessException("This request isn't yours.");
        }

        _db.Friendships.Remove(friendship);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveFriendAsync(Guid userId, Guid friendUserId)
    {
        var friendship = await _db.Friendships.SingleOrDefaultAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == userId && f.AddresseeId == friendUserId) ||
             (f.RequesterId == friendUserId && f.AddresseeId == userId)))
            ?? throw new KeyNotFoundException("You're not friends with that person.");

        _db.Friendships.Remove(friendship);
        await _db.SaveChangesAsync();
    }

    public async Task<List<FriendResponse>> GetFriendsAsync(Guid userId)
    {
        var friendships = await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Include(f => f.Requester)
            .Include(f => f.Addressee)
            .ToListAsync();

        // Whichever side of the row isn't "me" is the friend — same "figure out
        // the other party" pattern regardless of who originally sent the request,
        // since Accepted friendships are symmetric (see Friendship's class comment).
        return friendships
            .Select(f => f.RequesterId == userId ? f.Addressee! : f.Requester!)
            .Select(u => new FriendResponse(u.Id, u.DisplayName, u.Tag ?? string.Empty))
            .OrderBy(u => u.DisplayName)
            .ToList();
    }

    public async Task<List<FriendRequestResponse>> GetIncomingRequestsAsync(Guid userId)
    {
        return await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Pending && f.AddresseeId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FriendRequestResponse(f.Id, f.RequesterId, f.Requester!.DisplayName, f.Requester!.Tag ?? string.Empty, f.CreatedAt))
            .ToListAsync();
    }

    public async Task<List<FriendRequestResponse>> GetOutgoingRequestsAsync(Guid userId)
    {
        return await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Pending && f.RequesterId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FriendRequestResponse(f.Id, f.AddresseeId, f.Addressee!.DisplayName, f.Addressee!.Tag ?? string.Empty, f.CreatedAt))
            .ToListAsync();
    }
}
