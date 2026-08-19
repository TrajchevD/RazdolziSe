import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { hapticImpact } from './haptics';
import { FriendService } from '../core/friend.service';
import { TripInviteService } from '../core/trip-invite.service';

interface TabDef {
  path: string;
  label: string;
  /** Matches when the current URL is exactly this or starts with `${path}/` —
   *  e.g. the Trips tab stays highlighted on /trips/:id (a trip's detail page)
   *  even though that route has its own back button and doesn't show this bar. */
  match: (url: string) => boolean;
}

/** Fixed bottom tab bar — five top-level destinations: Home, Trips, Friends,
 * Analytics, Profile. The old standalone "Requests" tab (trip invites +
 * incoming friend requests) folded into Friends as a section at the top of
 * that screen (see friends.ts) — matching the imported design's tab set,
 * which never had a separate Requests destination either. Its badge count
 * moved with it onto the Friends tab below.
 *
 * Only ever rendered by `App` (see app.ts) when the viewport is mobile-sized
 * AND a user is signed in — persists across every signed-in screen, including
 * pushed ones like trip detail (see app.ts's showTabBar for why that changed
 * from the original "hide on pushed screens" behavior). */
@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink],
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
})
export class TabBar implements OnInit {
  private readonly router = inject(Router);
  protected readonly friendService = inject(FriendService);
  private readonly inviteService = inject(TripInviteService);

  /** Trip-invite count for the Friends tab's badge — friend-request count comes
   *  straight from friendService.incomingRequests() (a shared signal several
   *  screens read), but trip invites have no equivalent shared signal, so this
   *  tab owns a plain local one just for its own badge count. */
  protected readonly tripInviteCount = signal(0);

  ngOnInit(): void {
    // Best-effort — populates the Friends tab's badge without making every
    // visitor open that tab first to discover they have something pending.
    // Same "fetch on a shared signal, several places read it" pattern as
    // AppNotificationService's bell badge in trip-list.
    this.friendService.refreshIncomingRequests().subscribe({ error: () => {} });
    this.inviteService.getMyInvites().subscribe({
      next: (invites) => this.tripInviteCount.set(invites.length),
      error: () => {},
    });
  }

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly tabs: TabDef[] = [
    { path: '/home', label: 'Home', match: (url) => url === '/home' },
    { path: '/trips', label: 'Trips', match: (url) => url === '/trips' || url.startsWith('/trips/') },
    { path: '/friends', label: 'Friends', match: (url) => url.startsWith('/friends') },
    { path: '/analytics', label: 'Analytics', match: (url) => url.startsWith('/analytics') },
    { path: '/profile', label: 'Profile', match: (url) => url.startsWith('/profile') },
  ];

  /** Total pending count for the Friends tab's badge — friend requests plus
   *  trip invites together, since both land in that screen's Requests section
   *  now (see friends.ts). */
  protected readonly requestCount = computed(
    () => this.friendService.incomingRequests().length + this.tripInviteCount(),
  );

  protected readonly activeTab = computed(() => {
    const url = this.currentUrl();
    return this.tabs.find((t) => t.match(url))?.path ?? null;
  });

  /** Skips the buzz on a tap that lands on the tab you're already on — switching
   *  screens gets the feedback, re-tapping the current tab (a no-op navigation)
   *  doesn't. */
  protected onTabTap(path: string): void {
    if (this.activeTab() !== path) {
      hapticImpact('light');
    }
  }
}
