import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { TripInviteService } from '../core/trip-invite.service';
import { FriendService } from '../core/friend.service';
import { NotificationService } from '../core/notification.service';
import { TripInviteResponse } from '../core/api.models';
import { avatarColor, initials } from '../shared/avatar-color';
import { hapticImpact, hapticNotification } from '../shared/haptics';

/** Global "Requests" inbox — everything that needs the signed-in user's explicit
 *  approval and isn't scoped to a trip they're already inside: incoming friend
 *  requests (reuses FriendService — same signal the Friends tab's own incoming
 *  list reads, so accepting/declining here stays in sync with that screen) and
 *  trip invitations (TripInviteService). Sending either kind now happens at its
 *  source instead of here — a friend request from Friends' search, a trip
 *  invite from inside the trip's own Members panel (see trip-detail.ts's
 *  Add Members flow) — this screen is purely the inbox for both, not a place to
 *  originate new requests. Selector/class renamed from the old Invites (this
 *  screen used to be trip-invites-only); templateUrl/styleUrl deliberately keep
 *  the old invites.html/.scss filenames since renaming them would delete-then-
 *  recreate under OneDrive sync, which this environment can't do reliably. */
@Component({
  selector: 'app-requests',
  imports: [DatePipe],
  templateUrl: './invites.html',
  styleUrl: './invites.scss',
})
export class Requests implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;
  protected readonly friendService = inject(FriendService);

  tripInvites = signal<TripInviteResponse[]>([]);
  isLoading = signal(true);
  loadError = signal<string | null>(null);

  /** Tracks which specific row (a friend-request or trip-invite id) is
   *  mid-accept/decline so only that row's buttons disable — same pattern as
   *  Friends' own busyId. */
  busyId = signal<string | null>(null);

  private readonly inviteService = inject(TripInviteService);
  private readonly notifications = inject(NotificationService);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    forkJoin({
      invites: this.inviteService.getMyInvites(),
      friendRequests: this.friendService.refreshIncomingRequests(),
    }).subscribe({
      next: ({ invites }) => {
        this.tripInvites.set(invites);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(err.error?.message ?? 'Could not load requests — check your connection and try again.');
      },
    });
  }

  acceptTripInvite(invite: TripInviteResponse): void {
    if (this.busyId()) return;
    this.busyId.set(invite.id);

    this.inviteService.accept(invite.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.tripInvites.set(this.tripInvites().filter((i) => i.id !== invite.id));
        hapticNotification('success');
        this.notifications.notify(`You're in — welcome to ${invite.tripName}.`);
      },
      error: (err) => {
        this.busyId.set(null);
        hapticNotification('error');
        this.notifications.notify(err.error?.message ?? 'Could not accept that invite.');
      },
    });
  }

  declineTripInvite(invite: TripInviteResponse): void {
    if (this.busyId()) return;
    this.busyId.set(invite.id);

    this.inviteService.decline(invite.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.tripInvites.set(this.tripInvites().filter((i) => i.id !== invite.id));
        hapticImpact('light');
      },
      error: (err) => {
        this.busyId.set(null);
        this.notifications.notify(err.error?.message ?? 'Could not decline that invite.');
      },
    });
  }

  acceptFriendRequest(requestId: string): void {
    if (this.busyId()) return;
    this.busyId.set(requestId);

    this.friendService.accept(requestId).subscribe({
      next: () => {
        this.busyId.set(null);
        hapticNotification('success');
      },
      error: (err) => {
        this.busyId.set(null);
        this.notifications.notify(err.error?.message ?? 'Could not accept that request.');
      },
    });
  }

  declineFriendRequest(requestId: string): void {
    if (this.busyId()) return;
    this.busyId.set(requestId);

    this.friendService.decline(requestId).subscribe({
      next: () => {
        this.busyId.set(null);
        hapticImpact('light');
      },
      error: (err) => {
        this.busyId.set(null);
        this.notifications.notify(err.error?.message ?? 'Could not remove that request.');
      },
    });
  }
}
