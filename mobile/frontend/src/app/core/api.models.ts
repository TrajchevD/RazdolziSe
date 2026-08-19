// These interfaces mirror the C# DTOs in backend/Dtos exactly (property-for-property).
// If you change a request/response shape on the backend, update the matching interface here.

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// deviceId is generated client-side (crypto.randomUUID()) and persisted via
// @capacitor/preferences — see DeviceIdService. displayName is optional and
// only takes effect the first time this device id is seen (see backend
// AuthService.GuestAsync) — used by join-claim.ts's "Continue as Guest" name
// prompt so a brand-new guest gets a real name instead of "Guest A1B2".
export interface GuestRequest {
  deviceId: string;
  displayName?: string;
}

export interface LinkAccountRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

// message is always present; debugCode only appears outside Production (see
// AuthController.DebugCodeResponse) — present here so TS doesn't complain if we
// ever want to read it in a dev build, but the UI never depends on it.
export interface CodeSentResponse {
  message: string;
  debugCode?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  isEmailVerified: boolean;
  // Discord-style "#XXXX" short id, paired with displayName — see backend
  // User.Tag. Always present (lazily backfilled server-side), never empty.
  tag: string;
}

// Returned by POST /api/identity/bootstrap and GET /api/identity/me. No token
// field — the httpOnly DeviceToken cookie itself is the credential, invisible
// to (and never stored by) JS. See IdentityService (identity.service.ts).
export interface IdentityResponse {
  userId: string;
  displayName: string;
  isAnonymous: boolean;
}

export interface CreateTripRequest {
  name: string;
  settlementCurrency: string;
}

export interface AddMemberRequest {
  email: string;
}

export interface AddGuestRequest {
  displayName: string;
}

export interface JoinTripRequest {
  code: string;
}

// role is 'Owner' | 'Member' — see backend TripMemberRole. claimedAt is null for
// an unclaimed name-only slot (pre-added by the owner, nobody's picked it yet);
// userId mirrors that (null until claimed).
export interface TripMemberResponse {
  tripMemberId: string;
  userId: string | null; // null for a guest with no account
  displayName: string;
  role: 'Owner' | 'Member';
  claimedAt: string | null;
}

// callerRole is computed per-request for whoever asked (Trip.OwnerId === caller ?
// 'Owner' : 'Member') — never a fixed property of the trip itself. Gates every
// owner-only action client-side: edit trip, add/remove members, edit/delete any
// expense, regenerate/deactivate the join code. The backend re-checks all of this
// independently (TripService.EnsureOwner) — this is UI-only, not the security boundary.
export interface TripResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  settlementCurrency: string;
  joinCode: string;
  inviteTokenActive: boolean;
  callerRole: 'Owner' | 'Member';
  members: TripMemberResponse[];
}

// Returned by GET /api/trips/join/:inviteToken before any claim happens.
// callerMembership is non-null when the requesting identity (JWT or device
// cookie) already has a slot on this trip — "existing-linked → straight in,
// skip the picker entirely" (see join/join-claim.ts).
export interface TripJoinPreviewResponse {
  tripId: string;
  tripName: string;
  settlementCurrency: string;
  unclaimedMembers: TripMemberResponse[];
  callerMembership: TripMemberResponse | null;
}

// Exactly one of tripMemberId (claim an existing unclaimed name) or
// newDisplayName (none of the names are me — self-add instead) should be set.
export interface ClaimMemberRequest {
  tripMemberId: string | null;
  newDisplayName: string | null;
}

export type SplitType = 'Equal' | 'Exact';

// amount is only used (and required) when the request's splitType is 'Exact'.
export interface ExpenseShareInput {
  tripMemberId: string;
  amount: number | null;
}

export type ExpenseCategory = 'Lodging' | 'Transport' | 'Food' | 'Groceries' | 'Activities' | 'Other';

export interface CreateExpenseRequest {
  paidByTripMemberId: string;
  description: string;
  amount: number; // in currency below, not necessarily the trip's settlement currency
  currency: string;
  expenseDate: string;
  splitType: SplitType;
  shares: ExpenseShareInput[]; // for 'Exact', each amount is also in currency above
  category: ExpenseCategory;
}

export interface ExpenseShareResponse {
  tripMemberId: string;
  displayName: string;
  amountOwed: number;
}

export interface ExpenseResponse {
  id: string;
  description: string;
  amount: number; // converted, in the trip's settlement currency
  originalAmount: number; // as entered, in currency below
  currency: string;
  exchangeRate: number;
  expenseDate: string;
  paidByTripMemberId: string;
  paidByDisplayName: string;
  splitType: SplitType;
  shares: ExpenseShareResponse[];
  category: ExpenseCategory;
  createdByTripMemberId: string;
}

export interface BalanceResponse {
  tripMemberId: string;
  displayName: string;
  netBalance: number;
}

export interface SettlementTransactionResponse {
  fromTripMemberId: string;
  fromDisplayName: string;
  toTripMemberId: string;
  toDisplayName: string;
  amount: number;
}

export interface RecordPaymentRequest {
  fromTripMemberId: string;
  toTripMemberId: string;
  amount: number;
}

export interface PaymentResponse {
  id: string;
  fromTripMemberId: string;
  fromDisplayName: string;
  toTripMemberId: string;
  toDisplayName: string;
  amount: number;
  paidAt: string;
}

export interface CurrencySuggestionResponse {
  currency: string;
}

// Looked up client-side first (Friends list, or a Name#Tag search reusing
// FriendService.search) — see backend CreateInviteRequest's own comment for why
// this isn't email-based.
export interface CreateInviteRequest {
  userId: string;
}

export interface TripInviteResponse {
  id: string;
  tripId: string;
  tripName: string;
  invitedByUserId: string;
  invitedByDisplayName: string;
  createdAt: string;
}

// 'PaymentReceived'/'FriendRequest'/'FriendRequestAccepted'/'TripInvite' are real,
// persisted, markable-read rows. 'InactivityNudge' is computed fresh server-side
// on every fetch, never stored (see AppNotificationService.GetInactivityNudgesAsync).
// Only persisted kinds' ids are valid to pass to AppNotificationService.markRead.
export type NotificationKind =
  | 'PaymentReceived'
  | 'InactivityNudge'
  | 'FriendRequest'
  | 'FriendRequestAccepted'
  | 'TripInvite'
  | 'TripMemberJoined';

export interface NotificationResponse {
  id: string;
  kind: NotificationKind;
  // Null for anything that isn't trip-scoped (the two friend-request kinds) —
  // see backend NotificationResponse's own comment.
  tripId: string | null;
  tripName: string | null;
  message: string;
  createdAt: string;
  isRead: boolean;
}

// "Alex#7Q2K" — exactly what's shown on someone's Profile, or what a scanned
// identity QR decodes to (see qr-scan.service.ts). See FriendService.SearchAsync
// (backend) for how this gets parsed.
export interface SearchUserRequest {
  query: string;
}

export interface UserSummaryResponse {
  userId: string;
  displayName: string;
  tag: string;
}

export interface SendFriendRequestRequest {
  userId: string;
}

export interface FriendRequestResponse {
  id: string;
  userId: string;
  displayName: string;
  tag: string;
  createdAt: string;
}

export interface FriendResponse {
  userId: string;
  displayName: string;
  tag: string;
}
