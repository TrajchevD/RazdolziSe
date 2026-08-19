import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as CapacitorApp } from '@capacitor/app';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { AuthService } from './auth.service';

const ENABLED_KEY = 'tripsplit_biometric_enabled';

/** Gates reopening the app behind Face ID/Touch ID/fingerprint — composes with
 *  Phases 1-2 rather than replacing them: it locks/unlocks the *device*, it
 *  doesn't care whether the session underneath is a guest or a linked account
 *  (see AuthService.currentUser, untouched by any of this).
 *
 *  Root-provided and constructed once from App (same pattern as NativeService,
 *  ThemeService) so `isLocked` is already correct by first paint. A complete
 *  no-op on web — Capacitor.isNativePlatform() guards the constructor exactly
 *  like NativeService does, since there's no "reopening the app" concept in a
 *  browser tab and @aparajita/capacitor-biometric-auth's web shim is only meant
 *  for that package's own dev/testing, not for us to rely on. */
@Injectable({ providedIn: 'root' })
export class BiometricLockService {
  private readonly authService = inject(AuthService);

  /** True while the lock screen (see shared/biometric-lock-screen) should cover
   *  the app. Only ever set true if the user opted in via setEnabled(true) —
   *  this is never a default/forced state for a new install. */
  readonly isLocked = signal(false);

  /** Mirrors the persisted preference so Profile can render an accurate toggle
   *  without awaiting a Preferences.get() itself. */
  readonly enabled = signal(false);

  /** "Face ID" / "Fingerprint" / etc., based on what the device actually has —
   *  falls back to a generic label until checkBiometry() resolves. */
  readonly biometryLabel = signal('biometric unlock');

  constructor() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    void this.init();
  }

  private async init(): Promise<void> {
    const { value } = await Preferences.get({ key: ENABLED_KEY });
    const isEnabled = value === 'true';
    this.enabled.set(isEnabled);

    // Lock immediately on cold start if the user opted in and there's actually a
    // session to protect — logging out already clears isLoggedIn, so a fresh
    // guest bootstrap on next launch is the only session this could gate.
    if (isEnabled && this.authService.isLoggedIn) {
      this.isLocked.set(true);
    }

    try {
      const result = await BiometricAuth.checkBiometry();
      this.biometryLabel.set(this.labelFor(result.biometryType));
    } catch {
      // Non-fatal — the lock screen just shows the generic label instead.
    }

    // Re-lock on every foreground resume, not just cold start — this is the
    // actual point of "unlock for reopening the app": backgrounding and
    // switching back in counts as reopening just as much as a cold launch does.
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && this.enabled() && this.authService.isLoggedIn) {
        this.isLocked.set(true);
      }
    });
  }

  private labelFor(type: BiometryType): string {
    switch (type) {
      case BiometryType.faceId:
        return 'Face ID';
      case BiometryType.touchId:
        return 'Touch ID';
      case BiometryType.fingerprintAuthentication:
        return 'fingerprint';
      case BiometryType.faceAuthentication:
        return 'face unlock';
      case BiometryType.irisAuthentication:
        return 'iris unlock';
      default:
        return 'biometric unlock';
    }
  }

  /** Whether this device can actually do this at all — Profile hides the toggle
   *  entirely rather than showing it disabled when this is false, since
   *  "why is this greyed out" is a worse UX than not mentioning it. */
  async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    try {
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable;
    } catch {
      return false;
    }
  }

  /** Turning this ON requires proving it works first — otherwise enrolling in a
   *  broken biometry state (or lying about device capability) could lock the
   *  user out of their own app with no way back in, since there is no PIN/
   *  password fallback screen built for this, only the OS's own device-credential
   *  fallback (allowDeviceCredential below). Turning it OFF never needs a prompt. */
  async setEnabled(next: boolean): Promise<void> {
    if (next) {
      await BiometricAuth.authenticate({
        reason: 'Confirm it is you to turn on biometric unlock',
        allowDeviceCredential: true,
        cancelTitle: 'Cancel',
      });
    }
    this.enabled.set(next);
    await Preferences.set({ key: ENABLED_KEY, value: String(next) });
  }

  /** Returns whether it succeeded rather than throwing — the lock screen just
   *  stays up and offers a retry button on failure/cancel, there's nothing else
   *  useful to do with a BiometryError at this call site. */
  async unlock(): Promise<boolean> {
    try {
      await BiometricAuth.authenticate({
        reason: 'Unlock RazdolziSe',
        allowDeviceCredential: true,
        cancelTitle: 'Cancel',
      });
      this.isLocked.set(false);
      return true;
    } catch {
      return false;
    }
  }
}
