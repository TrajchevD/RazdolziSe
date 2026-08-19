import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TripService } from '../core/trip.service';
import { SettlementService } from '../core/settlement.service';
import { ViewportService } from '../core/viewport.service';
import { AuthService } from '../core/auth.service';
import { AppNotificationService } from '../core/app-notification.service';
import { NotificationService } from '../core/notification.service';
import { TripResponse } from '../core/api.models';
import { avatarColor, initials } from '../shared/avatar-color';
import { hapticImpact } from '../shared/haptics';
import { PullToRefresh } from '../shared/pull-to-refresh';

/** New landing screen for mobile (see app.routes.ts — '' redirects here), matching
 *  the imported design's Home/dashboard concept. Desktop never sees this: ngOnInit
 *  bounces straight to /trips when !viewport.isMobile(), so desktop's landing
 *  behavior is completely unchanged.
 *
 *  Fetches its own trips + balances rather than reusing TripList's — same
 *  reasoning as Friends/Trips each doing their own fetch: no cross-screen cache to
 *  keep in sync, at the cost of one extra round-trip when you land here. Balance
 *  math itself can't drift from the Trips screen though, since both call
 *  SettlementService.getMyBalancesByTrip() (the shared source of truth). */
@Component({
  selector: 'app-home',
  imports: [DecimalPipe, DatePipe, RouterLink, PullToRefresh],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  trips = signal<TripResponse[]>([]);
  tripBalances = signal<Record<string, number>>({});
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  isRefreshing = signal(false);

  overallOwed = computed(() =>
    Object.values(this.tripBalances())
      .filter((v) => v > 0)
      .reduce((sum, v) => sum + v, 0),
  );
  overallOwe = computed(() =>
    Object.values(this.tripBalances())
      .filter((v) => v < 0)
      .reduce((sum, v) => sum - v, 0),
  );
  overallNet = computed(() => this.overallOwed() - this.overallOwe());

  /** "Latest" rather than "current"/"active" — TripResponse has no status or
   *  date-range field, only createdAt, so this is honestly just the most
   *  recently-created trip rather than a fabricated "active trip" concept the
   *  real data model doesn't support. See the restructure plan's own note on
   *  this. */
  latestTrip = computed<TripResponse | null>(() => {
    const list = this.trips();
    if (list.length === 0) return null;
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  });

  latestTripBalance = computed<number | undefined>(() => {
    const trip = this.latestTrip();
    return trip ? this.tripBalances()[trip.id] : undefined;
  });

  /** Top few rows only — this is a dashboard preview, not the full inbox (that's
   *  /notifications, linked via "See all" below). */
  recentActivity = computed(() => this.appNotifications.notifications().slice(0, 4));

  greeting = computed(() => {
    const hour = new Date().getHours();
    const firstName = this.authService.currentUser()?.displayName?.split(' ')[0] ?? '';
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  });

  constructor(
    private tripService: TripService,
    private settlementService: SettlementService,
    protected viewport: ViewportService,
    protected authService: AuthService,
    protected appNotifications: AppNotificationService,
    private notifications: NotificationService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.viewport.isMobile()) {
      this.router.navigate(['/trips'], { replaceUrl: true });
      return;
    }
    this.loadTrips();
    // Best-effort — powers the "Recent activity" section below; a failed fetch
    // just means that section stays empty rather than blocking the page.
    this.appNotifications.refresh().subscribe({ error: () => {} });
  }

  loadTrips(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.isLoading.set(false);
        this.loadBalances(trips);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(err.error?.message ?? 'Could not load your trips — check your connection and try again.');
      },
    });
  }

  /** Pull-to-refresh's (refresh) handler — same "keep the current content on
   *  screen, report failures as a toast" reasoning as trip-list.ts's refreshTrips(). */
  refreshHome(): void {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);

    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.isRefreshing.set(false);
        this.loadBalances(trips);
      },
      error: (err) => {
        this.isRefreshing.set(false);
        this.notifications.notify(err.error?.message ?? 'Could not refresh — check your connection.');
      },
    });
    this.appNotifications.refresh().subscribe({ error: () => {} });
  }

  private loadBalances(trips: TripResponse[]): void {
    const userId = this.authService.currentUser()?.userId ?? '';
    this.settlementService.getMyBalancesByTrip(trips, userId).subscribe({
      next: (balances) => this.tripBalances.set(balances),
      error: () => this.notifications.notify('Could not load balances for your trips.'),
    });
  }

  /** Deep-links into trip-detail, which reads `?open=` once in ngOnInit to pop the
   *  right bottom sheet immediately (see trip-detail.ts's handleOpenQueryParam). */
  openAddExpense(tripId: string): void {
    hapticImpact('light');
    this.router.navigate(['/trips', tripId], { queryParams: { open: 'expense' } });
  }

  openSettleUp(tripId: string): void {
    hapticImpact('light');
    this.router.navigate(['/trips', tripId], { queryParams: { open: 'settle' } });
  }
}
