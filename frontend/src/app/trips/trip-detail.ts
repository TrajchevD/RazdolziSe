import { Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TripService } from '../core/trip.service';
import { ExpenseService } from '../core/expense.service';
import { SettlementService } from '../core/settlement.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmDialogService } from '../core/confirm-dialog.service';
import { ViewportService } from '../core/viewport.service';
import {
  BalanceResponse,
  ExpenseCategory,
  ExpenseResponse,
  ExpenseShareInput,
  PaymentResponse,
  SettlementTransactionResponse,
  SplitType,
  TripResponse,
} from '../core/api.models';
import { EXPENSE_CATEGORIES, getCategoryMeta } from '../shared/category';
import { avatarColor, initials } from '../shared/avatar-color';
import { CURRENCIES, getCurrencyMeta } from '../shared/currency';

/** A single row in the combined activity feed — either an expense or a settle-up
 *  payment, so both show up together sorted by when they happened. */
type ActivityItem =
  | { kind: 'expense'; date: string; expense: ExpenseResponse }
  | { kind: 'payment'; date: string; payment: PaymentResponse };

/** One calendar-day group of expenses, for the mobile Expenses tab's "JUN 14" headers. */
interface ExpenseDateGroup {
  key: string;
  label: string;
  expenses: ExpenseResponse[];
}

@Component({
  selector: 'app-trip-detail',
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './trip-detail.html',
  styleUrl: './trip-detail.scss',
})
export class TripDetail implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly getCategoryMeta = getCategoryMeta;
  protected readonly currencies = CURRENCIES;
  protected readonly getCurrencyMeta = getCurrencyMeta;

  tripId = '';
  trip = signal<TripResponse | null>(null);
  pageError = signal<string | null>(null);
  expenses = signal<ExpenseResponse[]>([]);
  payments = signal<PaymentResponse[]>([]);
  balances = signal<BalanceResponse[]>([]);
  settlementPlan = signal<SettlementTransactionResponse[]>([]);

  /** Expenses and settle-up payments together, newest first — one overview of
   *  everything that's happened on the trip instead of two separate lists. */
  activity = computed<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...this.expenses().map((expense) => ({ kind: 'expense' as const, date: expense.expenseDate, expense })),
      ...this.payments().map((payment) => ({ kind: 'payment' as const, date: payment.paidAt, payment })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  editingExpenseId = signal<string | null>(null);

  // Mobile-only UI state (unused by the desktop template).
  activeTab = signal<'expenses' | 'balances' | 'activity' | 'categories'>('expenses');
  showAddExpense = signal(false);
  showSettleUp = signal(false);
  showMembers = signal(false);

  /** The signed-in user's own trip-membership row, so the mobile summary card can
   *  show "your balance" without the user having to hunt for their name in the list. */
  myTripMemberId = computed<string | null>(() => {
    const t = this.trip();
    const userId = this.authService.currentUser()?.userId;
    if (!t || !userId) {
      return null;
    }
    return t.members.find((m) => m.userId === userId)?.tripMemberId ?? null;
  });

  myBalance = computed(() => {
    const id = this.myTripMemberId();
    if (!id) {
      return 0;
    }
    return this.balances().find((b) => b.tripMemberId === id)?.netBalance ?? 0;
  });

  /** Only the trip owner may delete the whole trip — enforced server-side too, this
   *  just keeps the affordance from showing for members who didn't create it. */
  isOwner = computed(() => {
    const t = this.trip();
    const userId = this.authService.currentUser()?.userId;
    return !!t && !!userId && t.ownerId === userId;
  });

  isDeletingTrip = signal(false);
  deleteTripError = signal<string | null>(null);

  /** The expense currently loaded into the add-expense overlay for editing, if any —
   *  looked up as a computed rather than inline in the template, since Angular
   *  template expressions can't contain arrow-function callbacks like `.find()`. */
  editingExpense = computed<ExpenseResponse | null>(() => {
    const id = this.editingExpenseId();
    if (!id) {
      return null;
    }
    return this.expenses().find((e) => e.id === id) ?? null;
  });

  /** Expenses grouped by calendar day, newest first, for the mobile Expenses tab's
   *  date headers (e.g. "JUN 14"). */
  expensesByDate = computed<ExpenseDateGroup[]>(() => {
    const groups = new Map<string, ExpenseResponse[]>();
    for (const expense of this.expenses()) {
      const key = expense.expenseDate.slice(0, 10);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(expense);
      } else {
        groups.set(key, [expense]);
      }
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, expenses]) => ({ key, label: this.formatDateLabel(key), expenses }));
  });

  // --- Spending-by-category breakdown (used by both the desktop section and the
  // mobile "Categories" tab) ---

  private readonly pieRadius = 60;
  private readonly pieCircumference = 2 * Math.PI * this.pieRadius;

  /** "group" for the whole trip's spending, or a tripMemberId for just that
   *  member's own share of every expense. */
  overviewScope = signal<string>('group');

  categoryBreakdown = computed(() => {
    const scope = this.overviewScope();
    const totals = new Map<string, number>();
    for (const cat of EXPENSE_CATEGORIES) {
      totals.set(cat.value, 0);
    }

    if (scope === 'group') {
      // Whole group: every expense's full amount, regardless of who paid or split it.
      for (const expense of this.expenses()) {
        totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
      }
    } else {
      // One member: just what THEY personally owe on each expense they were part of.
      for (const expense of this.expenses()) {
        const share = expense.shares.find((s) => s.tripMemberId === scope);
        if (share) {
          totals.set(expense.category, (totals.get(expense.category) ?? 0) + share.amountOwed);
        }
      }
    }

    const entries = EXPENSE_CATEGORIES.map((cat) => ({ category: cat, amount: totals.get(cat.value) ?? 0 }))
      .filter((entry) => entry.amount > 0.004)
      .sort((a, b) => b.amount - a.amount);

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return { entries, total };
  });

  /** Each category's slice of the donut, as SVG stroke-dasharray/dashoffset values —
   *  the standard trick for drawing a pie/donut chart with plain <circle> elements
   *  and no charting library. */
  pieSlices = computed(() => {
    const { entries, total } = this.categoryBreakdown();
    if (total <= 0) {
      return [];
    }
    const circumference = this.pieCircumference;
    let cumulative = 0;
    return entries.map((entry) => {
      const fraction = entry.amount / total;
      const length = fraction * circumference;
      const dashArray = `${length} ${circumference - length}`;
      const dashOffset = -cumulative * circumference;
      cumulative += fraction;
      return { category: entry.category, amount: entry.amount, fraction, dashArray, dashOffset };
    });
  });

  settlementError = signal<string | null>(null);
  // Tracks which settlement transaction (by "fromId:toId") is currently being recorded,
  // so we can disable just that one button and avoid a double-submit while the request is in flight.
  settlingKey = signal<string | null>(null);

  newMemberEmail = '';
  memberError = signal<string | null>(null);
  isSavingMember = signal(false);

  newGuestName = '';
  guestError = signal<string | null>(null);
  isSavingGuest = signal(false);

  // Guards against a double-tapped/double-clicked Save re-firing addExpense() while
  // the first request is still in flight. Without this, two near-simultaneous PUT
  // requests for the same edit both load the same expense shares, both try to delete
  // them, and the second one hits a DbUpdateConcurrencyException (0 rows affected)
  // since the first request already deleted them.
  isSavingExpense = signal(false);

  // Tracks which expense id is currently being deleted, same "disable just this one
  // button" pattern as settlingKey above — guards against a double-tapped Delete
  // re-firing deleteExpense() for the same (or another) row while one is in flight.
  deletingExpenseId = signal<string | null>(null);

  expenseDescription = '';
  expenseAmount: number | null = null;
  // Defaults to the trip's own settlement currency (set once the trip loads — see
  // loadAll()); the user can still pick a different one per expense.
  expenseCurrency = 'EUR';
  // Plain "YYYY-MM-DD" string bound to a native <input type="date">. Kept as a date-only
  // string (no time-of-day, no timezone conversion) to avoid an off-by-one-day bug that
  // `new Date(...).toISOString()` would introduce for anyone west of UTC.
  expenseDateInput = this.todayDateInput();
  expensePaidBy = '';
  expenseParticipants = new Set<string>();
  expenseError = signal<string | null>(null);

  expenseCategory: ExpenseCategory = 'Other';

  splitType: SplitType = 'Equal';
  // Keyed by tripMemberId — only used when splitType is 'Exact'. A member with no
  // entry (or 0) here is simply not part of the split, same as an unchecked box
  // in the Equal-split checklist.
  exactAmounts: Record<string, number | null> = {};

  get exactTotal(): number {
    return Object.values(this.exactAmounts).reduce((sum: number, v) => sum + (v ?? 0), 0);
  }

  get exactRemaining(): number {
    return (this.expenseAmount ?? 0) - this.exactTotal;
  }

  get exactIsBalanced(): boolean {
    return Math.abs(this.exactRemaining) < 0.005;
  }

  /** Total of every expense in the trip, regardless of who paid or how it was split. */
  groupTotal = computed(() => this.expenses().reduce((sum, e) => sum + e.amount, 0));

  /** What each member has personally paid out across all expenses — "who paid the most." */
  memberSpending = computed(() => {
    const t = this.trip();
    const exps = this.expenses();
    if (!t) {
      return [];
    }
    return t.members.map((m) => ({
      tripMemberId: m.tripMemberId,
      displayName: m.displayName,
      total: exps.filter((e) => e.paidByTripMemberId === m.tripMemberId).reduce((sum, e) => sum + e.amount, 0),
    }));
  });

  /** Group total spread evenly across every member, regardless of how expenses were actually split. */
  groupAverage = computed(() => {
    const t = this.trip();
    if (!t || t.members.length === 0) {
      return 0;
    }
    return this.groupTotal() / t.members.length;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService,
    private expenseService: ExpenseService,
    private settlementService: SettlementService,
    private authService: AuthService,
    protected viewport: ViewportService,
    private notifications: NotificationService,
    private confirmDialog: ConfirmDialogService,
  ) {}

  /** Only the trip member who originally logged an expense may edit or delete it —
   *  enforced server-side too, this just keeps the buttons from being shown at all
   *  for expenses someone else added. */
  canEditExpense(expense: ExpenseResponse): boolean {
    const id = this.myTripMemberId();
    return !!id && expense.createdByTripMemberId === id;
  }

  /** "You paid" if the signed-in user covered this expense, otherwise "{name} paid". */
  paidByLabel(expense: ExpenseResponse): string {
    return expense.paidByTripMemberId === this.myTripMemberId() ? 'You paid' : `${expense.paidByDisplayName} paid`;
  }

  /** What the signed-in user personally owes on this expense, or null if they
   *  weren't part of the split at all. */
  myShareOf(expense: ExpenseResponse): number | null {
    const id = this.myTripMemberId();
    if (!id) {
      return null;
    }
    const share = expense.shares.find((s) => s.tripMemberId === id);
    return share ? share.amountOwed : null;
  }

  /** "3000 MKD" if this expense was entered in a different currency than the trip's
   *  settlement currency, so the activity/expense lists can show what was actually
   *  paid alongside the converted total. Null when they match — nothing extra to show. */
  originalAmountLabel(expense: ExpenseResponse): string | null {
    if (expense.currency === this.trip()?.settlementCurrency) {
      return null;
    }
    return `${expense.originalAmount.toFixed(2)} ${expense.currency}`;
  }

  private formatDateLabel(isoDate: string): string {
    // isoDate is "YYYY-MM-DD" — parse as local, not UTC-midnight-shifted, to avoid
    // an off-by-one day near midnight in timezones behind UTC.
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  ngOnInit(): void {
    this.tripId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadAll();
  }

  loadAll(): void {
    this.pageError.set(null);
    this.tripService.getTrip(this.tripId).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        // Default the add-expense form to "paid by the first member, split among everyone."
        if (!this.expensePaidBy && trip.members.length > 0) {
          this.expensePaidBy = trip.members[0].tripMemberId;
        }
        this.expenseParticipants = new Set(trip.members.map((m) => m.tripMemberId));
        this.expenseCurrency = trip.settlementCurrency;
      },
      // The whole page renders nothing until `trip()` is set (see trip-detail.html),
      // so this is the one load failure that needs a real page-level message rather
      // than a toast — otherwise a failed fetch here just leaves a blank screen.
      error: (err) => this.pageError.set(err.error?.message ?? 'Could not load this trip — check your connection and try again.'),
    });
    this.refreshExpenses();
    this.refreshSettlement();
    this.refreshPayments();
  }

  refreshExpenses(): void {
    this.expenseService.getExpenses(this.tripId).subscribe({
      next: (expenses) => this.expenses.set(expenses),
      error: () => this.notifications.notify('Could not load expenses.'),
    });
  }

  refreshSettlement(): void {
    this.settlementService.getBalances(this.tripId).subscribe({
      next: (balances) => this.balances.set(balances),
      error: () => this.notifications.notify('Could not load balances.'),
    });
    this.settlementService.getSettlementPlan(this.tripId).subscribe({
      next: (plan) => this.settlementPlan.set(plan),
      error: () => this.notifications.notify('Could not load the settlement plan.'),
    });
  }

  refreshPayments(): void {
    this.settlementService.getPayments(this.tripId).subscribe({
      next: (payments) => this.payments.set(payments),
      error: () => this.notifications.notify('Could not load payment history.'),
    });
  }

  settleUp(txn: SettlementTransactionResponse): void {
    const key = `${txn.fromTripMemberId}:${txn.toTripMemberId}`;
    this.settlementError.set(null);
    this.settlingKey.set(key);

    this.settlementService
      .recordPayment(this.tripId, {
        fromTripMemberId: txn.fromTripMemberId,
        toTripMemberId: txn.toTripMemberId,
        amount: txn.amount,
      })
      .subscribe({
        next: () => {
          this.settlingKey.set(null);
          this.refreshSettlement();
          this.refreshPayments();
        },
        error: (err) => {
          this.settlingKey.set(null);
          this.settlementError.set(err.error?.message ?? 'Could not record payment.');
        },
      });
  }

  addMember(): void {
    if (!this.newMemberEmail.trim() || this.isSavingMember()) {
      return;
    }
    this.memberError.set(null);
    this.isSavingMember.set(true);

    this.tripService.addMember(this.tripId, { email: this.newMemberEmail.trim() }).subscribe({
      next: (trip) => {
        this.isSavingMember.set(false);
        this.trip.set(trip);
        this.expenseParticipants = new Set(trip.members.map((m) => m.tripMemberId));
        this.newMemberEmail = '';
      },
      error: (err) => {
        this.isSavingMember.set(false);
        this.memberError.set(err.error?.message ?? 'Could not add member.');
      },
    });
  }

  addGuest(): void {
    if (!this.newGuestName.trim() || this.isSavingGuest()) {
      return;
    }
    this.guestError.set(null);
    this.isSavingGuest.set(true);

    this.tripService.addGuest(this.tripId, { displayName: this.newGuestName.trim() }).subscribe({
      next: (trip) => {
        this.isSavingGuest.set(false);
        this.trip.set(trip);
        this.expenseParticipants = new Set(trip.members.map((m) => m.tripMemberId));
        this.newGuestName = '';
      },
      error: (err) => {
        this.isSavingGuest.set(false);
        this.guestError.set(err.error?.message ?? 'Could not add guest.');
      },
    });
  }

  toggleParticipant(tripMemberId: string, checked: boolean): void {
    if (checked) {
      this.expenseParticipants.add(tripMemberId);
    } else {
      this.expenseParticipants.delete(tripMemberId);
    }
  }

  /** Loads an existing expense's values into the add-expense form so submitting
   *  it updates that expense instead of creating a new one. */
  startEditExpense(expense: ExpenseResponse): void {
    this.editingExpenseId.set(expense.id);
    this.expenseError.set(null);
    this.expenseDescription = expense.description;
    // Edit what was actually typed (original amount + currency), not the converted
    // trip-currency figure — re-saving looks up a fresh rate and reconverts.
    this.expenseAmount = expense.originalAmount;
    this.expenseCurrency = expense.currency;
    this.expenseDateInput = expense.expenseDate.slice(0, 10);
    this.expensePaidBy = expense.paidByTripMemberId;
    this.splitType = expense.splitType;
    this.expenseCategory = expense.category;

    if (expense.splitType === 'Exact') {
      this.exactAmounts = {};
      for (const share of expense.shares) {
        // Shares are stored in the trip's settlement currency — convert back to what
        // was originally typed so the edit form's total lines up with expenseAmount
        // above. Not byte-identical to the original entry if rounding redistribution
        // touched this particular share, but close enough to edit from.
        const original = expense.exchangeRate ? share.amountOwed / expense.exchangeRate : share.amountOwed;
        this.exactAmounts[share.tripMemberId] = Math.round(original * 100) / 100;
      }
      this.expenseParticipants = new Set(expense.shares.map((s) => s.tripMemberId));
    } else {
      this.expenseParticipants = new Set(expense.shares.map((s) => s.tripMemberId));
      this.exactAmounts = {};
    }
  }

  /** Opens the mobile full-screen "Add expense" overlay pre-filled for editing.
   *  No-ops for an expense the signed-in user didn't create — the template already
   *  hides the affordance, this is just a second guard against a stray call. */
  openEditExpense(expense: ExpenseResponse): void {
    if (!this.canEditExpense(expense)) {
      return;
    }
    this.startEditExpense(expense);
    this.showAddExpense.set(true);
  }

  /** Opens the mobile full-screen "Add expense" overlay for a brand-new expense. */
  openAddExpense(): void {
    this.editingExpenseId.set(null);
    this.resetExpenseForm();
    this.showAddExpense.set(true);
  }

  cancelEditExpense(): void {
    this.editingExpenseId.set(null);
    this.resetExpenseForm();
    this.showAddExpense.set(false);
  }

  openSettleUp(): void {
    this.showSettleUp.set(true);
  }

  closeSettleUp(): void {
    this.showSettleUp.set(false);
  }

  openMembers(): void {
    this.memberError.set(null);
    this.guestError.set(null);
    this.showMembers.set(true);
  }

  closeMembers(): void {
    this.showMembers.set(false);
  }

  async deleteExpense(expense: ExpenseResponse): Promise<void> {
    if (this.deletingExpenseId()) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(`Delete "${expense.description}"? This can't be undone.`, {
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.expenseError.set(null);
    this.deletingExpenseId.set(expense.id);

    this.expenseService.deleteExpense(this.tripId, expense.id).subscribe({
      next: () => {
        this.deletingExpenseId.set(null);
        if (this.editingExpenseId() === expense.id) {
          this.cancelEditExpense();
        }
        this.refreshExpenses();
        this.refreshSettlement();
      },
      error: (err) => {
        this.deletingExpenseId.set(null);
        this.expenseError.set(err.error?.message ?? 'Could not delete expense.');
      },
    });
  }

  async deleteTrip(): Promise<void> {
    const t = this.trip();
    if (!t || this.isDeletingTrip()) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(
      `Delete "${t.name}"? This permanently deletes every expense, payment, and member record for this trip. This can't be undone.`,
      { confirmLabel: 'Delete trip', danger: true },
    );
    if (!confirmed) {
      return;
    }

    this.deleteTripError.set(null);
    this.isDeletingTrip.set(true);

    this.tripService.deleteTrip(t.id).subscribe({
      next: () => {
        this.isDeletingTrip.set(false);
        this.router.navigate(['/trips']);
      },
      error: (err) => {
        this.isDeletingTrip.set(false);
        this.deleteTripError.set(err.error?.message ?? 'Could not delete trip.');
        this.notifications.notify(this.deleteTripError()!);
      },
    });
  }

  private todayDateInput(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private resetExpenseForm(): void {
    this.expenseDescription = '';
    this.expenseAmount = null;
    this.expenseDateInput = this.todayDateInput();
    this.exactAmounts = {};
    this.expenseCategory = 'Other';
    this.splitType = 'Equal';
    const t = this.trip();
    this.expenseParticipants = new Set(t ? t.members.map((m) => m.tripMemberId) : []);
    this.expenseCurrency = t?.settlementCurrency ?? 'EUR';
  }

  addExpense(): void {
    if (this.isSavingExpense()) {
      return;
    }
    this.expenseError.set(null);

    if (!this.expenseDescription.trim() || !this.expenseAmount || this.expenseAmount <= 0) {
      this.expenseError.set('Enter a description and an amount greater than zero.');
      return;
    }
    if (!this.expenseDateInput) {
      this.expenseError.set('Pick a date for this expense.');
      return;
    }

    let shares: ExpenseShareInput[];

    if (this.splitType === 'Exact') {
      const entries = Object.entries(this.exactAmounts).filter(
        (entry): entry is [string, number] => entry[1] !== null && entry[1] > 0,
      );
      if (entries.length === 0) {
        this.expenseError.set('Enter an amount for at least one participant.');
        return;
      }
      if (!this.exactIsBalanced) {
        this.expenseError.set(
          `Amounts must add up to ${this.expenseAmount.toFixed(2)} — they currently sum to ${this.exactTotal.toFixed(2)}.`,
        );
        return;
      }
      shares = entries.map(([tripMemberId, amount]) => ({ tripMemberId, amount }));
    } else {
      if (this.expenseParticipants.size === 0) {
        this.expenseError.set('Select at least one participant to split with.');
        return;
      }
      shares = Array.from(this.expenseParticipants).map((tripMemberId) => ({ tripMemberId, amount: null }));
    }

    const editingId = this.editingExpenseId();
    const request = {
      paidByTripMemberId: this.expensePaidBy,
      description: this.expenseDescription.trim(),
      amount: this.expenseAmount,
      currency: this.expenseCurrency,
      expenseDate: this.expenseDateInput,
      splitType: this.splitType,
      shares,
      category: this.expenseCategory,
    };

    const request$ = editingId
      ? this.expenseService.updateExpense(this.tripId, editingId, request)
      : this.expenseService.addExpense(this.tripId, request);

    this.isSavingExpense.set(true);
    request$.subscribe({
      next: () => {
        this.isSavingExpense.set(false);
        this.editingExpenseId.set(null);
        this.resetExpenseForm();
        this.showAddExpense.set(false);
        this.refreshExpenses();
        this.refreshSettlement();
      },
      error: (err) => {
        this.isSavingExpense.set(false);
        this.expenseError.set(err.error?.message ?? (editingId ? 'Could not save changes.' : 'Could not add expense.'));
      },
    });
  }
}
