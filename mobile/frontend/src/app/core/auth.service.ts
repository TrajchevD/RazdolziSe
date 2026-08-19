import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  AuthResponse,
  CodeSentResponse,
  ForgotPasswordRequest,
  GuestRequest,
  LinkAccountRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from './api.models';
import { DeviceIdService } from './device-id.service';

const TOKEN_KEY = 'tripsplit_token';
const REFRESH_TOKEN_KEY = 'tripsplit_refresh_token';
const USER_KEY = 'tripsplit_user';

interface StoredUser {
  userId: string;
  displayName: string;
  isGuest: boolean;
  isEmailVerified: boolean;
  tag: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${API_BASE_URL}/auth`;

  /** Reactive "who's logged in" state — components read this via a signal instead
   *  of re-parsing localStorage themselves. */
  readonly currentUser = signal<StoredUser | null>(this.readStoredUser());

  constructor(
    private http: HttpClient,
    private router: Router,
    private deviceIdService: DeviceIdService,
  ) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(tap((res) => this.storeSession(res)));
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(tap((res) => this.storeSession(res)));
  }

  /** Trades a per-device id for a JWT with no email/password/verification,
   *  creating a guest account on first call and reusing it on every call after.
   *  Used automatically on native app launch (see guest-bootstrap.ts), and also
   *  reachable directly from the "Continue as guest" button on login.ts/
   *  join-claim.ts — not native-only in practice, just native-automatic. */
  guest(request: GuestRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/guest`, request).pipe(tap((res) => this.storeSession(res)));
  }

  /** Turns the current guest into a portable account — same user id, same trips,
   *  just an email/password on the row now. Requires a token (the interceptor
   *  attaches it), so this only ever succeeds for whoever is already signed in. */
  linkAccount(request: LinkAccountRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/link-account`, request)
      .pipe(tap((res) => this.storeSession(res)));
  }

  /** Emails (or, outside Production, echoes back — see CodeSentResponse) a fresh
   *  verification code to the current user's own address. */
  sendVerification(): Observable<CodeSentResponse> {
    return this.http.post<CodeSentResponse>(`${this.apiUrl}/send-verification`, {});
  }

  verifyEmail(request: VerifyEmailRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/verify-email`, request)
      .pipe(tap((res) => this.storeSession(res)));
  }

  /** Anonymous — no token attached, this is how you get back in when you've lost
   *  access. Always resolves the same way whether or not the email has an account
   *  (see AuthController.ForgotPassword), so the UI can't distinguish the two either. */
  forgotPassword(request: ForgotPasswordRequest): Observable<CodeSentResponse> {
    return this.http.post<CodeSentResponse>(`${this.apiUrl}/forgot-password`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, request);
  }

  /** Trades the stored refresh token for a brand-new access token (and a rotated
   *  refresh token — see AuthService.RefreshAsync server-side) — called by
   *  auth.interceptor.ts on a 401 rather than on any fixed timer, so this only
   *  actually fires once the 120-minute access token has genuinely expired. */
  refresh(): Observable<AuthResponse> {
    const request: RefreshRequest = { refreshToken: this.refreshToken ?? '' };
    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, request).pipe(tap((res) => this.storeSession(res)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    // Without this, the next native app launch would silently re-attach the same
    // guest (or linked) identity via guest-bootstrap.ts, and a "logout" the user
    // explicitly asked for would never actually stick.
    if (Capacitor.isNativePlatform()) {
      this.deviceIdService.clearDeviceId();
    }
    this.router.navigate(['/login']);
  }

  private storeSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    const user: StoredUser = {
      userId: res.userId,
      displayName: res.displayName,
      isGuest: res.isGuest,
      isEmailVerified: res.isEmailVerified,
      tag: res.tag,
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private readStoredUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  }
}
