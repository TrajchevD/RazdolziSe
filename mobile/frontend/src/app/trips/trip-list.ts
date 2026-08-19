import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TripService } from '../core/trip.service';
import { SettlementService } from '../core/settlement.service';
import { ViewportService } from '../core/viewport.service';
import { CurrencyService } from '../core/currency.service';
import { TripResponse } from '../core/api.models';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { AppNotificationService } from '../core/app-notification.service';
import { QrScanService } from '../core/qr-scan.service';
import { ThemeService } from '../core/theme.service';
import { avatarColor, initials } from '../shared/avatar-color';
import { CURRENCIES } from '../shared/currency';
import { hapticImpact, hapticNotification } from '../shared/haptics';
import { PullToRefresh } from '../shared/pull-to-refresh';

@Component({
  selector: 'app-trip-list',
  imports: [FormsModule, RouterLink, DecimalPipe, PullToRefresh],
  templateUrl: './trip-list.html',
  styleUrl: './trip-list.scss',
})
export class TripList implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  protected readonly currencies = CURRENCIES;

  trips = signal<TripResponse[]>([]);
  newTripName = '';
  newTripCurrency = 'EUR';
  errorMessage = signal<string | null>(null);
  loadError = signal<string | null>(null);
  isLoading = signal(true);
  isCreatingTrip = signal(false);
  /** Drives PullToRefresh's spinner — separate from isLoading deliberately: a
   *  pull-to-refresh re-fetch shouldn't blank the list back to skeleton cards,
   *  it should just quietly update it in place while the small pull indicator
   *  spins. */
  isRefreshing = signal(false);

  /** The signed-in user's own net balance in each trip, keyed by trip id — used for
   *  the mobile overview's per-trip chip and the aggregate "overall" summary card. */
  tripBalances = signal<Record<string, number>>({});

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

  showCreateForm = signal(false);

  // "Join a trip" via its shareable code (see trip-detail's Members overlay for
  // where a code is generated/shown) — a second, faster path onto a trip
  // alongside the existing email-invite flow, not a replacement for it.
  joinCode = '';
  showJoinForm = signal(false);
  isJoiningTrip = signal(false);
  joinError = signal<string | null>(null);

  constructor(
    private tripService: TripService,
    private settlementService: SettlementService,
    protected viewport: ViewportService,
    protected authService: AuthService,
    private router: Router,
    private notifications: NotificationService,
    protected appNotifications: AppNotificationService,
    protected theme: ThemeService,
    private currencyService: CurrencyService,
    protected qrScan: QrScanService,
  ) {}

  ngOnInit(): void {
    this.loadTrips();
    // Best-effort default for the "create trip" currency field — falls back to the
    // 'EUR' already set above if the lookup fails or is slow, never blocks the page.
    this.currencyService.suggestCurrency().subscribe({
      next: (res) => (this.newTripCurrency = res.currency),
      error: () => {},
    });
    // Best-effort — a failed fetch here just means the header bell shows no
    // badge instead of blocking the trips list, which is the actual page.
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

  /** Pull-to-refresh's (refresh) handler — same request as loadTrips(), but
   *  keeps the current list on screen while it's in flight instead of clearing
   *  it back to a loading state, and reports failures as a toast instead of
   *  swapping the whole screen to an error state (you can already see your last
   *  known-good list; no need to take that away just because a refresh failed). */
  refreshTrips(): void {
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
  }

  toggleCreateForm(): void {
    hapticImpact('light');
    this.showCreateForm.set(!this.showCreateForm());
  }

  /** Fetches the current user's own balance within each trip so the mobile view can
   *  show "you are owed/owe $X" per trip and an aggregate total up top. Shared with
   *  Home (see SettlementService.getMyBalancesByTrip) so the two screens' balance
   *  math can't drift apart. */
  private loadBalances(trips: TripResponse[]): void {
    const userId = this.authService.currentUser()?.userId ?? '';

    this.settlementService.getMyBalancesByTrip(trips, userId).subscribe({
      next: (balances) => this.tripBalances.set(balances),
      // Non-fatal: the trip list itself already loaded fine, this only powers the
      // per-trip balance chips and the "overall" summary card, so a toast is enough
      // rather than blocking the whole page with an error state.
      error: () => this.notifications.notify('Could not load balances for your trips.'),
    });
  }

  createTrip(): void {
    if (!this.newTripName.trim() || this.isCreatingTrip()) {
      return;
    }
    this.errorMessage.set(null);
    this.isCreatingTrip.set(true);

    this.tripService.createTrip({ name: this.newTripName.trim(), settlementCurrency: this.newTripCurrency }).subscribe({
      next: (trip) => {
        this.isCreatingTrip.set(false);
        this.newTripName = '';
        hapticNotification('success');
        this.router.navigate(['/trips', trip.id]);
      },
      error: (err) => {
        this.isCreatingTrip.set(false);
        hapticNotification('error');
        this.errorMessage.set(err.error?.message ?? 'Could not create trip.');
      },
    });
  }

  toggleJoinForm(): void {
    hapticImpact('light');
    this.joinError.set(null);
    this.showJoinForm.set(!this.showJoinForm());
  }

  /** The QR a trip's Members panel shows encodes the plain join code as text
   *  (see trip-detail.ts's joinCodeQrUrl) — scanning it just fills the same
   *  field typing it would, then submits immediately so a scan is a single
   *  action instead of "scan, then still have to tap Join". */
  async scanToJoin(): Promise<void> {
    const scanned = await this.qrScan.scan();
    if (!scanned) return;

    this.joinCode = scanned;
    hapticImpact('light');
    this.joinTrip();
  }

  joinTrip(): void {
    if (!this.joinCode.trim() || this.isJoiningTrip()) {
      return;
    }
    this.joinError.set(null);
    this.isJoiningTrip.set(true);

    this.tripService.joinByCode({ code: this.joinCode.trim() }).subscribe({
      next: (trip) => {
        this.isJoiningTrip.set(false);
        this.joinCode = '';
        hapticNotification('success');
        this.router.navigate(['/trips', trip.id]);
      },
      error: (err) => {
        this.isJoiningTrip.set(false);
        hapticNotification('error');
        this.joinError.set(err.error?.message ?? 'Could not join that trip — check the code and try again.');
      },
    });
  }
}
