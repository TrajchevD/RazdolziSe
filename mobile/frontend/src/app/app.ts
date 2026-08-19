import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ToastContainer } from './shared/toast-container';
import { ConfirmDialogHost } from './shared/confirm-dialog-host';
import { TabBar } from './shared/tab-bar';
import { BiometricLockScreen } from './shared/biometric-lock-screen';
import { ThemeService } from './core/theme.service';
import { NativeService } from './core/native.service';
import { AuthService } from './core/auth.service';
import { ViewportService } from './core/viewport.service';
import { BiometricLockService } from './core/biometric-lock.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer, ConfirmDialogHost, TabBar, BiometricLockScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Injected (rather than left unused) purely so the service constructs immediately
  // on app bootstrap and applies the saved/preferred theme before first paint,
  // instead of waiting for some later component to first ask for it.
  private readonly theme = inject(ThemeService);
  // Same pattern — wires up the Android back button, status bar, and splash
  // screen dismissal on native builds; a complete no-op when this build is
  // opened in a plain browser (see NativeService for the guard).
  private readonly native = inject(NativeService);
  // Same pattern again — constructs immediately so `isLocked` already reflects
  // the saved preference (and locks a returning user) before first paint,
  // instead of waiting for Profile to be visited once.
  protected readonly biometricLock = inject(BiometricLockService);

  private readonly authService = inject(AuthService);
  private readonly viewport = inject(ViewportService);
  private readonly router = inject(Router);

  /** Guards against the lock screen ever rendering for a logged-out user — e.g.
   *  right after logout, isLocked could still be stale-true from before the
   *  session was cleared. */
  protected readonly showLockScreen = computed(
    () => this.biometricLock.isLocked() && !!this.authService.currentUser(),
  );

  // /login, /register, /forgot-password are reachable even while currentUser()
  // is still non-null — e.g. navigating there directly, or the auth interceptor
  // bouncing an expired-refresh-token request back to /login without clearing
  // the (now-stale) signal first. Without this route check the tab bar would
  // render underneath the auth card in that case, visibly squeezing/shifting it
  // — see AUTH_ROUTES below.
  private static readonly AUTH_ROUTES = ['/login', '/register', '/forgot-password'];

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly isOnAuthRoute = computed(() =>
    App.AUTH_ROUTES.some((route) => this.currentUrl() === route || this.currentUrl().startsWith(`${route}/`)),
  );

  /** Desktop keeps its existing header-based nav (trip-list's desktop branch) —
   * the bottom tab bar is a mobile-only pattern, so this also gates on
   * viewport.isMobile(), not just auth state. Deliberately NOT route-gated to
   * hide on trip-detail/notifications anymore (the user wants it persistent
   * everywhere once signed in) — the one route check that remains is the auth
   * pages, which must stay bar-free even in the edge case above. */
  protected readonly showTabBar = computed(
    () => this.viewport.isMobile() && !!this.authService.currentUser() && !this.isOnAuthRoute(),
  );
}
