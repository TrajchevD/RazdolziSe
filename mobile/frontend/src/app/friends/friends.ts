import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FriendService } from '../core/friend.service';
import { TripInviteService } from '../core/trip-invite.service';
import { NotificationService } from '../core/notification.service';
import { QrScanService } from '../core/qr-scan.service';
import { TripInviteResponse, UserSummaryResponse } from '../core/api.models';
import { avatarColor, initials } from '../shared/avatar-color';
import { hapticImpact, hapticNotification } from '../shared/haptics';

/** Real Friends screen — supersedes the old friends/ placeholder now that the
 *  backend actually has a Friendship concept (search by Name#Tag, send/accept/
 *  decline requests, a real friends list). See FriendService (backend) for the
 *  request-lifecycle rules (an "add" on someone who already requested you is an
 *  instant accept, not a duplicate pending row).
 *
 *  Also absorbs the old standalone Requests tab (see invites.ts, now unrouted)
 *  as a "Requests" section up top — incoming friend requests plus trip
 *  invitations, both needing the signed-in user's explicit approval. Matches
 *  the imported design's IA, which never had a separate Requests destination
 *  either. */
@Component({
  selector: 'app-friends',
  imports: [FormsModule, DatePipe],
  templateUrl: './friends.html',
  styleUrl: './friends.scss',
})
export class Friends implements OnInit {
  protected readonly friendService = inject(FriendService);
  protected readonly qrScan = inject(QrScanService);
  private readonly tripInviteService = inject(TripInviteService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  protected readonly scanSupported = this.qrScan.isAvailable();

  isLoading = signal(true);
  loadError = signal<string | null>(null);

  tripInvites = signal<TripInviteResponse[]>([]);

  searchQuery = '';
  isSearching = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<UserSummaryResponse | null>(null);
  isSendingRequest = signal(false);

  /** Tracks which specific request/invite/friend row is mid-action so only that
   *  row's buttons disable — same reasoning as invites.ts's old busyId. */
  busyId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
    this.handleScanQueryParam();
  }

  /** Lets Profile's "Scan a friend's QR" button (see profile.ts's
   *  scanFriendCode()) land here with the camera already open instead of
   *  making the user find the small 📷 icon next to search themselves.
   *  Clears the param immediately (replaceUrl, no history entry) so a refresh
   *  or back-navigation doesn't reopen the scanner a second time. */
  private handleScanQueryParam(): void {
    const shouldScan = this.route.snapshot.queryParamMap.get('scan');
    if (!shouldScan) return;

    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    if (this.scanSupported) {
      void this.scanToSearch();
    }
  }

  load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    forkJoin({
      friends: this.friendService.refreshFriends(),
      incoming: this.friendService.refreshIncomingRequests(),
      outgoing: this.friendService.refreshOutgoingRequests(),
      invites: this.tripInviteService.getMyInvites(),
    }).subscribe({
      next: ({ invites }) => {
        this.tripInvites.set(invites);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(err.error?.message ?? 'Could not load friends — check your connection and try again.');
      },
    });
  }

  acceptTripInvite(invite: TripInviteResponse): void {
    if (this.busyId()) return;
    this.busyId.set(invite.id);

    this.tripInviteService.accept(invite.id).subscribe({
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

    this.tripInviteService.decline(invite.id).subscribe({
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

  search(): void {
    if (!this.searchQuery.trim() || this.isSearching()) return;
    this.searchError.set(null);
    this.searchResult.set(null);
    this.isSearching.set(true);

    this.friendService.search({ query: this.searchQuery.trim() }).subscribe({
      next: (result) => {
        this.isSearching.set(false);
        this.searchResult.set(result);
      },
      error: (err) => {
        this.isSearching.set(false);
        this.searchError.set(err.error?.message ?? 'No one found with that name and tag.');
      },
    });
  }

  async scanToSearch(): Promise<void> {
    const scanned = await this.qrScan.scan();
    if (!scanned) return;

    this.searchQuery = scanned;
    hapticImpact('light');
    this.search();
  }

  sendRequest(target: UserSummaryResponse): void {
    if (this.isSendingRequest()) return;
    this.isSendingRequest.set(true);

    this.friendService.sendRequest({ userId: target.userId }).subscribe({
      next: () => {
        this.isSendingRequest.set(false);
        this.searchResult.set(null);
        this.searchQuery = '';
        hapticNotification('success');
        this.notifications.notify(`Friend request sent to ${target.displayName}#${target.tag}.`, 'info');
      },
      error: (err) => {
        this.isSendingRequest.set(false);
        this.searchError.set(err.error?.message ?? 'Could not send that request.');
      },
    });
  }

  // Reused as "Cancel" for a sent (outgoing) request in the "Pending" section
  // below — declineFriendRequest() above is the one used for *incoming*
  // requests in the new Requests section; both end up calling the same
  // FriendService.decline() either way, they're just triggered from different
  // rows for different reasons.
  decline(requestId: string): void {
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

  remove(userId: string): void {
    if (this.busyId()) return;
    this.busyId.set(userId);

    this.friendService.remove(userId).subscribe({
      next: () => {
        this.busyId.set(null);
        hapticImpact('light');
      },
      error: (err) => {
        this.busyId.set(null);
        this.notifications.notify(err.error?.message ?? 'Could not remove that friend.');
      },
    });
  }
}
