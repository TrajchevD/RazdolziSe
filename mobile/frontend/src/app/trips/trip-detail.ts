import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TripService } from '../core/trip.service';
import { ExpenseService } from '../core/expense.service';
import { SettlementService } from '../core/settlement.service';
import { AuthService } from '../core/auth.service';
import { IdentityService } from '../core/identity.service';
import { FriendService } from '../core/friend.service';
import { TripInviteService } from '../core/trip-invite.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmDialogService } from '../core/confirm-dialog.service';
import { ViewportService } from '../core/viewport.service';
import {
  BalanceResponse,
  ExpenseCategory,
  ExpenseResponse,
  ExpenseShareInput,
  FriendResponse,
  PaymentResponse,
  SettlementTransactionResponse,
  SplitType,
  TripResponse,
  UserSummaryResponse,
} from '../core/api.models';
import { EXPENSE_CATEGORIES, getCategoryMeta } from '../shared/category';
import { avatarColor, initials } from '../shared/avatar-color';
import { CURRENCIES, getCurrencyMeta } from '../shared/currency';
import { hapticNotification } from '../shared/haptics';

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
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe],
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

  /** Mobile "Add expense" sheet: 'steps' walks a brand-new expense through 2
   *  short screens (details+category → paid by+split) instead of one long
   *  form — friendlier on a phone keyboard, and each step is small enough to
   *  validate before moving on. Used to be 3 screens (details / paid by /
   *  split as three separate steps) — paid-by and split are now one screen,
   *  since "who paid" and "how it's split" are both quick, related decisions
   *  that don't each need their own full-screen step. 'single' is the
   *  original all-fields-at-once form, kept reachable via the "Use
   *  single-page form" link for anyone who prefers it (and used automatically
   *  when editing an existing expense, where every field is likely already
   *  right except the one being fixed — see openEditExpense). Both modes bind
   *  the exact same fields below, so switching between them mid-entry loses
   *  nothing. */
  expenseFormMode = signal<'steps' | 'single'>('steps');
  expenseStep = signal<1 | 2>(1);

  /** Step 1 → 2 gate: the basics (description/amount/date/category) have to
   *  be filled in before "who paid, how it's split" is worth asking about. */
  get canProceedFromDetails(): boolean {
    return !!this.expenseDescription.trim() && !!this.expenseAmount && this.expenseAmount > 0 && !!this.expenseDateInput;
  }

  /** Submit gate for step 2 — expensePaidBy is pre-filled to the signed-in
   *  user's own member by resetExpenseForm(), so in practice this only blocks
   *  a trip with zero members (shouldn't happen — the owner is always one). */
  get canProceedFromPaidBy(): boolean {
    return !!this.expensePaidBy;
  }

  nextExpenseStep(): void {
    if (this.expenseStep() === 1 && !this.canProceedFromDetails) return;
    this.expenseStep.update((s) => (s < 2 ? ((s + 1) as 1 | 2) : s));
  }

  prevExpenseStep(): void {
    this.expenseStep.update((s) => (s > 1 ? ((s - 1) as 1 | 2) : s));
  }

  /** Switches the sheet between the guided steps and the classic single-page
   *  form without closing/reopening it or touching anything already typed. */
  switchExpenseFormMode(mode: 'steps' | 'single'): void {
    this.expenseFormMode.set(mode);
    if (mode === 'steps') {
      this.expenseStep.set(1);
    }
  }

  // Mobile-only UI state (unused by the desktop template). The desktop template
  // (further down trip-detail.html) is intentionally untouched — it's a single
  // inline section, not these overlays/tabs, matching how the rest of this file
  // already keeps mobile/desktop layouts separate while sharing all the same state.
  activeTab = signal<'expenses' | 'balances' | 'info'>('expenses');
  showAddExpense = signal(false);
  showSettleUp = signal(false);

  /** Which overlay (if any) is mid-close, driven by a CSS exit animation instead of
   *  disappearing instantly — see trip-detail.scss's `.overlay.closing`/
   *  `overlaySlideDown`. One shared signal is safe since Add Expense and Settle Up
   *  are never open at the same time. */
  closingOverlay = signal<'expense' | 'settle' | null>(null);

  /** The caller's own resolved user id. A JWT session (real login, or native
   *  guest — see guest-bootstrap.ts) already carries this in AuthService, so it's
   *  used as-is when present. A web anonymous identity has no JWT and stores
   *  nothing client-side by design (see identity.service.ts) — its userId is only
   *  known to the server via the httpOnly cookie, so it's fetched once via
   *  GET /api/identity/me and cached here. Without this, an anonymous web trip
   *  Owner would never match their own `t.ownerId`/member row below. */
  private myUserId = signal<string | null>(null);

  private resolveMyUserId(): void {
    if (this.myUserId()) {
      return;
    }
    this.identityService.me().subscribe({
      next: (identity) => this.myUserId.set(identity.userId),
      // Not fatal — isOwner() below doesn't depend on this (it reads
      // trip().callerRole, computed server-side regardless of auth mechanism),
      // it just means "your balance" won't highlight until this resolves, or
      // ever, if the backend truly can't identify the caller (shouldn't happen:
      // getTrip() itself would already have 401'd first).
      error: () => {},
    });
  }

  /** The signed-in user's own trip-membership row, so the mobile summary card can
   *  show "your balance" without the user having to hunt for their name in the list. */
  myTripMemberId = computed<string | null>(() => {
    const t = this.trip();
    const userId = this.myUserId();
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

  /** Only the trip Owner may delete the whole trip, edit/delete any expense, add
   *  members, or regenerate the join code — enforced server-side too (see
   *  TripService.EnsureOwner/ExpenseService's own EnsureOwner), this just keeps
   *  those affordances from showing to a plain Member. Reads `callerRole` off the
   *  already-loaded TripResponse — computed server-side per-request from
   *  `Trip.OwnerId` regardless of whether the caller resolved via JWT or the
   *  anonymous DeviceToken cookie — rather than comparing user ids locally,
   *  which would silently break for a web anonymous Owner (no JWT, no stored
   *  userId — see myUserId above). */
  isOwner = computed(() => this.trip()?.callerRole === 'Owner');

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

  // "Add members" now lives entirely inside the trip (Friends / Invite user /
  // Guest), replacing the old flat "add member by email" instant-add form —
  // see openAddMemberMode below. null = the picker itself is closed (just the
  // three option pills show); otherwise which sub-panel is open.
  addMemberMode = signal<'friends' | 'invite' | 'guest' | null>(null);

  friendPickerFilter = '';
  /** userIds invited via either the Friends picker or the Invite-user search
   *  during this Members-panel session, so a just-invited person's button reads
   *  "Invited" immediately instead of staying "Invite" until the next full
   *  reload (there's no shared "pending trip invites I sent" signal to check
   *  against the way friendStatus() checks friendService.outgoingRequests()). */
  tripInvitedUserIds = signal<Set<string>>(new Set());
  busyTripInviteUserId = signal<string | null>(null);
  tripInviteError = signal<string | null>(null);

  /** Friends not already on this trip and not already invited this session,
   *  optionally narrowed by friendPickerFilter (matches display name or tag,
   *  case-insensitive) — what the Friends picker actually lists. */
  availableFriendsForTrip = computed<FriendResponse[]>(() => {
    const t = this.trip();
    if (!t) return [];
    const memberUserIds = new Set(t.members.map((m) => m.userId).filter((id): id is string => !!id));
    const filter = this.friendPickerFilter.trim().toLowerCase();
    return this.friendService
      .friends()
      .filter((f) => !memberUserIds.has(f.userId))
      .filter((f) => !filter || f.displayName.toLowerCase().includes(filter) || f.tag.toLowerCase().includes(filter));
  });

  inviteSearchQuery = '';
  isSearchingInviteUser = signal(false);
  inviteSearchError = signal<string | null>(null);
  inviteSearchResult = signal<UserSummaryResponse | null>(null);

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

  /** Members with no positive exact amount typed in yet — the ones a "split
   *  the rest evenly" suggestion/action applies to. A member the caller
   *  hasn't touched is 0/null in exactAmounts (see that field's own comment),
   *  which is indistinguishable from "explicitly excluded" — same as today,
   *  this just treats both as "not yet decided" for suggestion purposes. */
  private unsetExactMemberIds(): string[] {
    const t = this.trip();
    if (!t) return [];
    return t.members.map((m) => m.tripMemberId).filter((id) => !((this.exactAmounts[id] ?? 0) > 0));
  }

  /** What the *rest* of the trip would each owe if the amount(s) already typed
   *  in (e.g. "I'll cover my own $15") were split evenly across everyone who
   *  hasn't entered one yet — shown as that member's input placeholder (see
   *  trip-detail.html) so it updates live as amounts are typed, without
   *  overwriting anything the caller already entered themselves. Null once
   *  this member already has a real entry (nothing to suggest over top of
   *  it), or once nobody's left unset. */
  suggestedExactAmount(memberId: string): number | null {
    if ((this.exactAmounts[memberId] ?? 0) > 0) {
      return null;
    }
    const unsetIds = this.unsetExactMemberIds();
    if (unsetIds.length === 0) {
      return null;
    }
    return this.exactRemaining / unsetIds.length;
  }

  /** Applies the suggestion above to every still-unset member at once — for
   *  "one person covers their own $15, everyone else splits what's left"
   *  without having to retype the same suggested number into each of their
   *  fields by hand. Uses the same floor-then-hand-out-leftover-cents
   *  approach as the backend's BuildEqualShares (sorted by member id) so the
   *  numbers this fills in are cent-for-cent what an Equal split of the
   *  remainder would compute — not just each field independently rounded. */
  splitExactRemainingEvenly(): void {
    const unsetIds = this.unsetExactMemberIds().sort();
    const count = unsetIds.length;
    if (count === 0) {
      return;
    }

    const remaining = this.exactRemaining;
    const baseShare = Math.floor((remaining / count) * 100) / 100;
    const allocated = baseShare * count;
    const remainderCents = Math.round((remaining - allocated) * 100);

    unsetIds.forEach((id, i) => {
      const share = baseShare + (i < remainderCents ? 0.01 : 0);
      this.exactAmounts[id] = Math.round(share * 100) / 100;
    });
  }

  canSplitRemainingEvenly(): boolean {
    return !!this.expenseAmount && this.unsetExactMemberIds().length > 0;
  }

  /** Each selected participant's share under an Equal split — shown on their
   *  card in the final step so "selected" carries an actual number, not just a
   *  checkmark (see the member-card redesign in trip-detail.html/.scss). Not a
   *  computed(): expenseParticipants is a plain Set mutated in place by
   *  toggleParticipant, same reasoning as exactTotal/exactRemaining above. */
  get equalShareAmount(): number {
    return this.expenseParticipants.size > 0 ? (this.expenseAmount ?? 0) / this.expenseParticipants.size : 0;
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
    private identityService: IdentityService,
    protected friendService: FriendService,
    private tripInviteService: TripInviteService,
    protected viewport: ViewportService,
    private notifications: NotificationService,
    private confirmDialog: ConfirmDialogService,
  ) {
    // Set here rather than in the field initializer above: field initializers run
    // before constructor-parameter properties are assigned, so `this.authService`
    // isn't available yet at that point (TS2729).
    this.myUserId.set(this.authService.currentUser()?.userId ?? null);
  }

  /** Matches the backend's actual rule (ExpenseService.Update/DeleteExpenseAsync):
   *  either the trip Owner, or whoever originally logged this specific expense —
   *  not just "any member," and not "owner only" either. This used to be
   *  owner-only here while the backend was still creator-only underneath, which
   *  meant a non-owner creator saw no edit/delete button at all even though the
   *  API would have accepted the request. */
  canEditExpense(expense: ExpenseResponse): boolean {
    return this.isOwner() || expense.createdByTripMemberId === this.myTripMemberId();
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
    this.resolveMyUserId();
    this.loadAll();
    // Best-effort, and not gated behind switchToInfo() — the desktop layout
    // shows the Members section inline rather than behind a tab switch, and even
    // on mobile the Info tab isn't necessarily visited first, so friendStatus()
    // needs this data available from first paint regardless.
    this.friendService.refreshFriends().subscribe({ error: () => {} });
    this.friendService.refreshOutgoingRequests().subscribe({ error: () => {} });
  }

  /** Lets Home's "Add expense"/"Settle up" buttons jump straight into the right
   *  sheet on this trip via `?open=expense` / `?open=settle`, instead of
   *  landing on the trip and making the user tap again. Called once the trip
   *  itself has loaded (see loadAll's `next`) so openAddExpense's form defaults
   *  (paid-by/participants) have real member data to work with. Clears the
   *  param immediately after acting on it (replaceUrl, no history entry) so a
   *  refresh or back-navigation doesn't reopen the sheet a second time. */
  private handleOpenQueryParam(): void {
    const open = this.route.snapshot.queryParamMap.get('open');
    if (!open) return;

    if (open === 'expense') {
      this.openAddExpense();
    } else if (open === 'settle') {
      this.openSettleUp();
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  loadAll(): void {
    this.pageError.set(null);
    this.tripService.getTrip(this.tripId).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        // Default the add-expense form to "paid by ME, split among everyone" —
        // myTripMemberId() is read fresh right after the set() above so it
        // reflects this trip's member list, not a stale one from before this
        // trip loaded. Falls back to the first member only for the (should-
        // never-happen) case where the signed-in user's own membership can't
        // be resolved yet — see myTripMemberId()'s own comment.
        if (!this.expensePaidBy && trip.members.length > 0) {
          this.expensePaidBy = this.myTripMemberId() ?? trip.members[0].tripMemberId;
        }
        this.expenseParticipants = new Set(trip.members.map((m) => m.tripMemberId));
        this.expenseCurrency = trip.settlementCurrency;
        this.handleOpenQueryParam();
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

  /** Opens one of the three "Add members" sub-panels — re-opening the same one
   *  is a no-op-ish toggle-closed, tapping a different pill switches straight
   *  over without needing a separate close tap first. */
  openAddMemberMode(mode: 'friends' | 'invite' | 'guest'): void {
    this.addMemberMode.set(this.addMemberMode() === mode ? null : mode);
    this.friendPickerFilter = '';
    this.inviteSearchQuery = '';
    this.inviteSearchResult.set(null);
    this.inviteSearchError.set(null);
    this.tripInviteError.set(null);
    this.guestError.set(null);
  }

  /** Sends a trip invite (consent-based — see TripInviteService) to a friend
   *  picked from the Friends sub-panel. Used by both the Friends picker and,
   *  indirectly via inviteSearchedUser below, the Invite-user search — same
   *  endpoint either way, the only difference is how the target was found. */
  inviteFriendToTrip(friend: FriendResponse): void {
    this.sendTripInvite(friend.userId, friend.displayName);
  }

  searchInviteUser(): void {
    if (!this.inviteSearchQuery.trim() || this.isSearchingInviteUser()) return;
    this.inviteSearchError.set(null);
    this.inviteSearchResult.set(null);
    this.isSearchingInviteUser.set(true);

    this.friendService.search({ query: this.inviteSearchQuery.trim() }).subscribe({
      next: (result) => {
        this.isSearchingInviteUser.set(false);
        this.inviteSearchResult.set(result);
      },
      error: (err) => {
        this.isSearchingInviteUser.set(false);
        this.inviteSearchError.set(err.error?.message ?? 'No one found with that name and tag.');
      },
    });
  }

  inviteSearchedUser(): void {
    const result = this.inviteSearchResult();
    if (!result) return;
    this.sendTripInvite(result.userId, result.displayName);
  }

  private sendTripInvite(userId: string, displayName: string): void {
    if (this.busyTripInviteUserId() || this.tripInvitedUserIds().has(userId)) return;
    this.tripInviteError.set(null);
    this.busyTripInviteUserId.set(userId);

    this.tripInviteService.sendInvite(this.tripId, { userId }).subscribe({
      next: () => {
        this.busyTripInviteUserId.set(null);
        this.tripInvitedUserIds.update((set) => new Set(set).add(userId));
        hapticNotification('success');
        this.notifications.notify(`Invite sent to ${displayName}.`, 'info');
      },
      error: (err) => {
        this.busyTripInviteUserId.set(null);
        const message = err.error?.message ?? 'Could not send that invite.';
        this.tripInviteError.set(message);
        this.notifications.notify(message);
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

  /** Opens the mobile "Add expense" sheet pre-filled for editing. No-ops for an
   *  expense the signed-in user didn't create — the template already hides the
   *  affordance, this is just a second guard against a stray call. Opens in
   *  'single' mode rather than the guided steps — editing is usually "fix the
   *  one field that's wrong," and every other field is already correct, so
   *  stepping through screens just to reach it would be slower, not friendlier. */
  openEditExpense(expense: ExpenseResponse): void {
    if (!this.canEditExpense(expense)) {
      return;
    }
    this.startEditExpense(expense);
    this.expenseFormMode.set('single');
    this.showAddExpense.set(true);
  }

  /** Opens the mobile "Add expense" sheet for a brand-new expense, starting on
   *  the guided steps' first screen. */
  openAddExpense(): void {
    this.editingExpenseId.set(null);
    this.resetExpenseForm();
    this.expenseFormMode.set('steps');
    this.expenseStep.set(1);
    this.showAddExpense.set(true);
  }

  cancelEditExpense(): void {
    this.editingExpenseId.set(null);
    this.resetExpenseForm();
    this.beginCloseOverlay('expense');
  }

  openSettleUp(): void {
    this.showSettleUp.set(true);
  }

  closeSettleUp(): void {
    this.beginCloseOverlay('settle');
  }

  /** Switches the mobile view to the Info tab — member list, join-code/QR, add-
   *  members panel, danger zone (this used to be its own "Members" overlay; now
   *  it's the 3rd tab, see trip-detail.html). Re-runs its resets/refreshes every
   *  time the tab is opened (not just once on page load) so friendStatus()/
   *  availableFriendsForTrip() reflect anything that changed elsewhere — e.g.
   *  accepting a request from the Friends tab, then coming back here — rather
   *  than showing stale "Add friend" buttons for people already added since. */
  switchToInfo(): void {
    this.activeTab.set('info');
    this.guestError.set(null);
    this.addMemberMode.set(null);
    this.tripInvitedUserIds.set(new Set());
    this.friendService.refreshFriends().subscribe({ error: () => {} });
    this.friendService.refreshOutgoingRequests().subscribe({ error: () => {} });
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Starts a sheet's close: plays the slide-down exit animation and waits for
   *  onOverlayAnimationEnd to actually unmount it. Closes instantly instead when
   *  the user has reduced-motion turned on — trip-detail.scss disables the CSS
   *  animation in that case, so the `animationend` event this normally waits for
   *  would otherwise never fire and the sheet would appear stuck open. */
  private beginCloseOverlay(which: 'expense' | 'settle'): void {
    if (this.prefersReducedMotion()) {
      if (which === 'expense') this.showAddExpense.set(false);
      else this.showSettleUp.set(false);
      return;
    }
    this.closingOverlay.set(which);
  }

  /** Bound to (animationend) on both sheets — fires for the entrance animation too
   *  (overlaySlideUp), so the `closingOverlay() === which` guard is what makes sure
   *  only the exit animation (overlaySlideDown) actually unmounts anything. */
  onOverlayAnimationEnd(which: 'expense' | 'settle'): void {
    if (this.closingOverlay() !== which) return;
    this.closingOverlay.set(null);
    if (which === 'expense') this.showAddExpense.set(false);
    else this.showSettleUp.set(false);
  }

  copyJoinCode(code: string): void {
    navigator.clipboard
      ?.writeText(code)
      .then(() => this.notifications.notify('Trip code copied.', 'info'))
      .catch(() => this.notifications.notify('Could not copy — copy it manually instead.'));
  }

  /** The actual shareable `/join/{inviteToken}` link (see join/join-claim.ts and
   *  app.routes.ts) — built client-side off the current page's own origin rather
   *  than a hardcoded domain, so it works the same in dev, staging, and prod
   *  without an extra config value. Opening it (or scanning its QR, see
   *  joinCodeQrUrl below) is what actually walks someone through the "Who are
   *  you?" claim picker; the bare code from copyJoinCode above is only useful
   *  for the older, simpler "type a code" flow (Trips list's "Have a trip code
   *  instead?" field), which self-adds under the caller's own account/identity
   *  without ever showing the picker. */
  joinInviteLink(code: string): string {
    return `${window.location.origin}/join/${code}`;
  }

  copyInviteLink(code: string): void {
    navigator.clipboard
      ?.writeText(this.joinInviteLink(code))
      .then(() => this.notifications.notify('Invite link copied.', 'info'))
      .catch(() => this.notifications.notify('Could not copy — copy it manually instead.'));
  }

  /** Renders the invite link as a QR image via a free, no-auth external image
   *  service — not worth pulling in a QR-generation library client- or
   *  server-side for something this small. Encodes the full `/join/{code}` link
   *  (not just the bare code) so scanning it with a phone's camera app opens the
   *  claim picker directly instead of showing plain text to retype. */
  joinCodeQrUrl(code: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(this.joinInviteLink(code))}`;
  }

  isRegeneratingInviteToken = signal(false);

  /** Owner-only (enforced server-side too, see TripService.RegenerateInviteTokenAsync)
   *  — mints a fresh `joinCode`/invite token, silently invalidating the old
   *  link/QR for anyone who hasn't already claimed a slot with it. Existing
   *  members already on the trip are unaffected. */
  regenerateInviteToken(): void {
    if (this.isRegeneratingInviteToken()) return;
    this.isRegeneratingInviteToken.set(true);

    this.tripService.regenerateInviteToken(this.tripId).subscribe({
      next: (trip) => {
        this.isRegeneratingInviteToken.set(false);
        this.trip.set(trip);
        this.notifications.notify('New trip code generated — the old link/QR no longer works.', 'info');
      },
      error: (err) => {
        this.isRegeneratingInviteToken.set(false);
        this.notifications.notify(err.error?.message ?? 'Could not regenerate the trip code.');
      },
    });
  }

  /** Drives which action (if any) the Info tab shows next to a member:
   *  no account at all (a guest), the signed-in user themself, already
   *  friends, a request already sent, or free to add. */
  friendStatus(memberUserId: string | null): 'guest' | 'self' | 'friends' | 'pending' | 'none' {
    if (!memberUserId) return 'guest';
    if (memberUserId === this.myUserId()) return 'self';
    if (this.friendService.friends().some((f) => f.userId === memberUserId)) return 'friends';
    if (this.friendService.outgoingRequests().some((r) => r.userId === memberUserId)) return 'pending';
    return 'none';
  }

  busyFriendUserId = signal<string | null>(null);

  addFriend(memberUserId: string, displayName: string): void {
    if (this.busyFriendUserId()) return;
    this.busyFriendUserId.set(memberUserId);

    this.friendService.sendRequest({ userId: memberUserId }).subscribe({
      next: () => {
        this.busyFriendUserId.set(null);
        hapticNotification('success');
        this.notifications.notify(`Friend request sent to ${displayName}.`, 'info');
      },
      error: (err) => {
        this.busyFriendUserId.set(null);
        this.notifications.notify(err.error?.message ?? 'Could not send that request.');
      },
    });
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
    // Re-defaults to "paid by ME" every time a brand-new expense form opens —
    // not just once on first trip load — so it doesn't keep showing whoever
    // was last selected (or whoever a just-edited expense happened to be paid
    // by) on the next Add. Falls back to the first member in the same rare
    // case loadAll()'s initial default does.
    this.expensePaidBy = this.myTripMemberId() ?? t?.members[0]?.tripMemberId ?? '';
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
        this.beginCloseOverlay('expense');
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
