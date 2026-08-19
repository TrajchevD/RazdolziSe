import { inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { DeviceIdService } from './device-id.service';

/** Passed directly to `provideAppInitializer` (see app.config.ts). Angular runs
 *  this once, synchronously within DI context, before the router's first
 *  navigation resolves — which is what lets a first-time native user land on the
 *  Home tab immediately instead of ever seeing a login screen: generate/reuse a
 *  per-device id, trade it for a JWT via `POST /api/auth/guest`, and store the
 *  session exactly like a normal login would (see AuthService.guest).
 *
 *  A complete no-op on web (Capacitor.isNativePlatform() false — the existing
 *  login-first flow there is untouched) and skipped entirely if a session
 *  already exists from a previous launch. */
export async function initializeGuestSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const authService = inject(AuthService);

  if (authService.isLoggedIn) {
    return;
  }

  const deviceIdService = inject(DeviceIdService);

  try {
    const deviceId = await deviceIdService.getOrCreateDeviceId();
    await firstValueFrom(authService.guest({ deviceId }));
  } catch {
    // Backend unreachable on first launch, etc. — fall through silently rather
    // than blocking app startup; authGuard sends the user to /login same as it
    // would for a logged-out user on the web.
  }
}
