import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { TripService } from '../core/trip.service';
import { SettlementService } from '../core/settlement.service';
import { ViewportService } from '../core/viewport.service';
import { TripResponse } from '../core/api.models';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ThemeService } from '../core/theme.service';
import { avatarColor, initials } from '../shared/avatar-color';

@Component({
  selector: 'app-trip-list',
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './trip-list.html',
  styleUrl: './trip-list.scss',
})
export class TripList implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  trips = signal<TripResponse[]>([]);
  newTripName = '';
  errorMessage = signal<string | null>(null);
  loadError = signal<string | null>(null);
  isLoading = signal(true);
  isCreatingTrip = signal(false);

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

  constructor(
    private tripService: TripService,
    private settlementService: SettlementService,
    protected viewport: ViewportService,
    protected authService: AuthService,
    private router: Router,
    private notifications: NotificationService,
    protected theme: ThemeService,
  ) {}

  ngOnInit(): void {
    this.loadTrips();
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

  toggleCreateForm(): void {
    this.showCreateForm.set(!this.showCreateForm());
  }

  /** Fetches the current user's own balance within each trip so the mobile view can
   *  show "you are owed/owe $X" per trip and an aggregate total up top. Small trip
   *  counts (a handful) make one balances call per trip perfectly fine. */
  private loadBalances(trips: TripResponse[]): void {
    const userId = this.authService.currentUser()?.userId;
    if (!userId || trips.length === 0) {
      this.tripBalances.set({});
      return;
    }

    const requests = trips.map((trip) =>
      this.settlementService.getBalances(trip.id).pipe(
        map((balances) => {
          const selfMember = trip.members.find((m) => m.userId === userId);
          const mine = selfMember ? balances.find((b) => b.tripMemberId === selfMember.tripMemberId) : undefined;
          return [trip.id, mine?.netBalance ?? 0] as [string, number];
        }),
      ),
    );

    forkJoin(requests).subscribe({
      next: (entries) => this.tripBalances.set(Object.fromEntries(entries)),
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

    this.tripService.createTrip({ name: this.newTripName.trim() }).subscribe({
      next: (trip) => {
        this.isCreatingTrip.set(false);
        this.newTripName = '';
        this.router.navigate(['/trips', trip.id]);
      },
      error: (err) => {
        this.isCreatingTrip.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not create trip.');
      },
    });
  }

  logout(): void {
    this.authService.logout();
  }
}
