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

export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

export interface CreateTripRequest {
  name: string;
}

export interface AddMemberRequest {
  email: string;
}

export interface AddGuestRequest {
  displayName: string;
}

export interface TripMemberResponse {
  tripMemberId: string;
  userId: string | null; // null for a guest with no account
  displayName: string;
}

export interface TripResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: TripMemberResponse[];
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
  amount: number;
  expenseDate: string;
  splitType: SplitType;
  shares: ExpenseShareInput[];
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
  amount: number;
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
