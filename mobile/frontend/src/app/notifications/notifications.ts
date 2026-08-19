import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AppNotificationService } from '../core/app-notification.service';
import { NotificationResponse } from '../core/api.models';
import { hapticImpact } from '../shared/haptics';

// Only these are real, persisted rows — see NotificationResponse.kind's own
// comment. InactivityNudge is computed fresh every fetch and was never given
// a row to mark read in the first place.
const MARKABLE_KINDS = ['PaymentReceived', 'FriendRequest', 'FriendRequestAccepted', 'TripInvite', 'TripMemberJoined'];

/** Reached via the bell icon in trip-list's header (both mobile and desktop),
 *  not the bottom tab bar — same "pushed screen with its own back arrow"
 *  pattern as trip-detail, since a 5th permanent tab for something that's
 *  usually empty would waste a slot the design didn't budget for. */
@Component({
  selector: 'app-notifications',
  imports: [DatePipe, RouterLink],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class Notifications implements OnInit {
  protected readonly notificationService = inject(AppNotificationService);

  isLoading = signal(true);
  loadError = signal<string | null>(null);
  busyId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.notificationService.refresh().subscribe({
      next: () => this.isLoading.set(false),
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(err.error?.message ?? 'Could not load notifications — check your connection and try again.');
      },
    });
  }

  dismiss(id: string): void {
    if (this.busyId()) return;
    this.busyId.set(id);
    hapticImpact('light');

    this.notificationService.markRead(id).subscribe({
      next: () => this.busyId.set(null),
      error: () => this.busyId.set(null),
    });
  }

  /** Deletes a notification outright — only ever offered once it's read (see
   *  notifications.html), so this is "clear it out of my inbox now that I've
   *  seen it," not a shortcut around actually reading it. */
  remove(id: string): void {
    if (this.busyId()) return;
    this.busyId.set(id);
    hapticImpact('medium');

    this.notificationService.deleteNotification(id).subscribe({
      next: () => this.busyId.set(null),
      error: () => this.busyId.set(null),
    });
  }

  isMarkable(kind: string): boolean {
    return MARKABLE_KINDS.includes(kind);
  }

  /** Same persisted-row restriction as isMarkable — an InactivityNudge has no
   *  backing row for DELETE /api/notifications/{id} to find. */
  isDeletable(kind: string): boolean {
    return MARKABLE_KINDS.includes(kind);
  }

  /** PaymentReceived/InactivityNudge link to the trip itself. TripInvite is also
   *  trip-scoped (tripId is set) but must NOT link there — the recipient isn't a
   *  member yet, only invited, so /trips/{id} would 404/forbid; it goes to
   *  Friends instead, where the invite can actually be accepted (see friends.ts's
   *  Requests section). Friend-request rows have no trip at all
   *  (NotificationResponse.tripId nullable) and link to Friends too. */
  linkFor(n: NotificationResponse): string[] {
    if (n.kind === 'TripInvite' || n.kind === 'FriendRequest' || n.kind === 'FriendRequestAccepted') {
      return ['/friends'];
    }
    return n.tripId ? ['/trips', n.tripId] : ['/friends'];
  }
}
