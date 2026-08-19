import { inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';

/** Web counterpart to guest-bootstrap.ts's initializeGuestSession — passed to
 *  provideAppInitializer (see app.config.ts). Angular runs this once,
 *  synchronously within DI context, before the router's first navigation
 *  resolves, so a first-time web visitor lands on Home/Trips immediately
 *  instead of ever seeing a login screen: it establishes (or silently reuses)
 *  an anonymous device identity via the httpOnly `DeviceToken` cookie set by
 *  `POST /api/identity/bootstrap` — the web equivalent of the native guest
 *  flow, just cookie-backed instead of JWT-backed (see IdentityController on
 *  the backend for why there's nothing here for JS to store).
 *
 *  A no-op on native (guest-bootstrap.ts owns that path there) and skipped
 *  entirely if the visitor already has a real logged-in session — including a
 *  native guest session that happens to be running inside a WebView, though in
 *  practice Capacitor.isNativePlatform() already routes those through the
 *  other initializer instead. */
export async function initializeWebIdentity(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    return;
  }

  const authService = inject(AuthService);
  if (authService.isLoggedIn) {
    return;
  }

  const identityService = inject(IdentityService);

  try {
    await firstValueFrom(identityService.bootstrap());
  } catch {
    // Backend unreachable on first load, third-party cookies blocked by the
    // browser, etc. — fall through silently rather than blocking app startup;
    // authGuard sends the user to /login same as it would for anyone else
    // with no session, and they can still register/login normally from there.
  }
}
