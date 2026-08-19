import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TripService } from '../core/trip.service';
import { ExpenseService } from '../core/expense.service';
import { ExpenseResponse, TripResponse } from '../core/api.models';
import { EXPENSE_CATEGORIES, getCategoryMeta } from '../shared/category';
import { avatarColor, initials } from '../shared/avatar-color';

type Range = 'week' | 'trip' | 'year';

interface Bar {
  label: string;
  amount: number;
  heightPct: number;
}

/** Real Analytics, built from the imported design's Analytics screen — a range-
 *  filtered total + bar chart, a category breakdown, and a "who spent the most"
 *  ranking. All three are computed client-side from a single trip's own
 *  ExpenseResponse[] (category/amount/expenseDate/paidBy are all real fields
 *  already fetched elsewhere in this app — trip-detail.ts's desktop-only donut
 *  chart uses the same category-aggregation technique), so no backend history/
 *  aggregation endpoint is needed.
 *
 *  Always scoped to ONE trip at a time via the picker below — never summed across
 *  trips. Different trips can have different `settlementCurrency` and this app has
 *  no cross-trip FX conversion, so adding amounts from two trips together would be
 *  currency-nonsense. This is also why the design's own "Lisbon Getaway"-scoped
 *  mock translates directly here rather than needing a global-aggregate redesign. */
@Component({
  selector: 'app-analytics',
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './analytics.html',
  styleUrl: './analytics.scss',
})
export class Analytics implements OnInit {
  protected readonly getCategoryMeta = getCategoryMeta;
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  trips = signal<TripResponse[]>([]);
  isLoadingTrips = signal(true);
  loadError = signal<string | null>(null);

  selectedTripId = signal<string | null>(null);
  selectedTrip = computed<TripResponse | null>(
    () => this.trips().find((t) => t.id === this.selectedTripId()) ?? null,
  );

  expenses = signal<ExpenseResponse[]>([]);
  isLoadingExpenses = signal(false);
  expensesError = signal<string | null>(null);

  range = signal<Range>('trip');

  /** Filters the selected trip's expenses down to the chosen range — 'trip' is
   *  every expense (no filter), 'week' the last 7 calendar days, 'year' the
   *  current calendar year. */
  rangeFilteredExpenses = computed(() => {
    const all = this.expenses();
    const range = this.range();
    if (range === 'trip') {
      return all;
    }
    const now = new Date();
    if (range === 'week') {
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return all.filter((e) => this.parseLocalDate(e.expenseDate) >= weekAgo);
    }
    // 'year'
    return all.filter((e) => this.parseLocalDate(e.expenseDate).getFullYear() === now.getFullYear());
  });

  totalSpent = computed(() => this.rangeFilteredExpenses().reduce((sum, e) => sum + e.amount, 0));

  /** Always exactly 7 bars, bucketed differently per range: one per day for
   *  'week', one per (up to 7, chunked) distinct expense date for 'trip', one per
   *  month in a rolling 7-month window for 'year'. Dates are parsed as local (not
   *  UTC-midnight-shifted) throughout — same off-by-one-day fix trip-detail.ts's
   *  formatDateLabel already applies. */
  dailyBars = computed<Bar[]>(() => {
    const range = this.range();
    const filtered = this.rangeFilteredExpenses();
    const now = new Date();

    let buckets: { label: string; amount: number }[];

    if (range === 'week') {
      buckets = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
        return { label: day.toLocaleDateString('en-US', { weekday: 'short' }), amount: 0 };
      });
      for (const e of filtered) {
        const d = this.parseLocalDate(e.expenseDate);
        const dayIndex = 6 - Math.round((now.getTime() - d.getTime()) / 86_400_000);
        if (dayIndex >= 0 && dayIndex < 7) {
          buckets[dayIndex].amount += e.amount;
        }
      }
    } else if (range === 'year') {
      buckets = Array.from({ length: 7 }, (_, i) => {
        const month = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1);
        return { label: month.toLocaleDateString('en-US', { month: 'short' }), amount: 0 };
      });
      for (const e of filtered) {
        const d = this.parseLocalDate(e.expenseDate);
        const monthIndex =
          6 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
        if (monthIndex >= 0 && monthIndex < 7) {
          buckets[monthIndex].amount += e.amount;
        }
      }
    } else {
      // 'trip' — one bucket per distinct expense date, chronological; chunked into
      // 7 contiguous groups if there are more than 7 distinct dates.
      const byDate = new Map<string, number>();
      for (const e of filtered) {
        const key = e.expenseDate.slice(0, 10);
        byDate.set(key, (byDate.get(key) ?? 0) + e.amount);
      }
      const dates = Array.from(byDate.keys()).sort();
      if (dates.length === 0) {
        buckets = Array.from({ length: 7 }, () => ({ label: '', amount: 0 }));
      } else if (dates.length <= 7) {
        buckets = dates.map((key) => ({
          label: this.formatDateLabel(key),
          amount: byDate.get(key) ?? 0,
        }));
        while (buckets.length < 7) {
          buckets.push({ label: '', amount: 0 });
        }
      } else {
        const chunkSize = Math.ceil(dates.length / 7);
        buckets = [];
        for (let i = 0; i < 7; i++) {
          const chunk = dates.slice(i * chunkSize, (i + 1) * chunkSize);
          if (chunk.length === 0) continue;
          const amount = chunk.reduce((sum, key) => sum + (byDate.get(key) ?? 0), 0);
          buckets.push({ label: this.formatDateLabel(chunk[0]), amount });
        }
      }
    }

    const max = Math.max(...buckets.map((b) => b.amount), 0.01);
    return buckets.map((b) => ({ ...b, heightPct: Math.max((b.amount / max) * 100, b.amount > 0 ? 4 : 0) }));
  });

  /** Same whole-group category-aggregation algorithm as trip-detail.ts's
   *  categoryBreakdown computed, minus its per-member overviewScope branch —
   *  Analytics only ever shows the whole trip's breakdown, matching the design
   *  (which has no per-member toggle on this screen either). */
  categoryBreakdown = computed(() => {
    const totals = new Map<string, number>();
    for (const cat of EXPENSE_CATEGORIES) {
      totals.set(cat.value, 0);
    }
    for (const e of this.rangeFilteredExpenses()) {
      totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
    }
    const entries = EXPENSE_CATEGORIES.map((cat) => ({ category: cat, amount: totals.get(cat.value) ?? 0 }))
      .filter((entry) => entry.amount > 0.004)
      .sort((a, b) => b.amount - a.amount);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      total,
      entries: entries.map((entry) => ({ ...entry, pct: total > 0 ? (entry.amount / total) * 100 : 0 })),
    };
  });

  /** Same "what each member personally paid" algorithm as trip-detail.ts's
   *  memberSpending computed, scoped to the range filter and sorted descending —
   *  the design's "Who spent the most" ranking. */
  spenderRanking = computed(() => {
    const trip = this.selectedTrip();
    if (!trip) return [];
    const filtered = this.rangeFilteredExpenses();
    const rows = trip.members
      .map((m) => ({
        tripMemberId: m.tripMemberId,
        displayName: m.displayName,
        amount: filtered.filter((e) => e.paidByTripMemberId === m.tripMemberId).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((row) => row.amount > 0.004)
      .sort((a, b) => b.amount - a.amount);
    const max = Math.max(...rows.map((r) => r.amount), 0.01);
    return rows.map((row) => ({ ...row, pct: (row.amount / max) * 100 }));
  });

  constructor(
    private tripService: TripService,
    private expenseService: ExpenseService,
  ) {}

  ngOnInit(): void {
    this.loadTrips();
  }

  loadTrips(): void {
    this.isLoadingTrips.set(true);
    this.loadError.set(null);
    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.isLoadingTrips.set(false);
        // Same "most recently created trip" heuristic as home.ts's latestTrip —
        // TripResponse has no status/date-range field to pick a real "current
        // trip" from, so this is an honest stand-in, not a fabricated concept.
        const latest = [...trips].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        if (latest) {
          this.onTripChange(latest.id);
        }
      },
      error: (err) => {
        this.isLoadingTrips.set(false);
        this.loadError.set(err.error?.message ?? 'Could not load your trips — check your connection and try again.');
      },
    });
  }

  onTripChange(tripId: string): void {
    this.selectedTripId.set(tripId);
    this.loadExpenses(tripId);
  }

  private loadExpenses(tripId: string): void {
    this.isLoadingExpenses.set(true);
    this.expensesError.set(null);
    this.expenseService.getExpenses(tripId).subscribe({
      next: (expenses) => {
        this.expenses.set(expenses);
        this.isLoadingExpenses.set(false);
      },
      error: (err) => {
        this.isLoadingExpenses.set(false);
        this.expensesError.set(err.error?.message ?? 'Could not load expenses for this trip.');
      },
    });
  }

  private parseLocalDate(isoDate: string): Date {
    const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private formatDateLabel(isoDate: string): string {
    return this.parseLocalDate(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
