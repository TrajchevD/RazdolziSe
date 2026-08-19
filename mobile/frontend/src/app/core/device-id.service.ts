import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const DEVICE_ID_KEY = 'tripsplit_device_id';

/** Persists a random per-device identifier used to bootstrap (and re-attach) a
 *  guest — or later, linked — session on native app start. See
 *  `initializeGuestSession` (guest-bootstrap.ts) for how this feeds
 *  `POST /api/auth/guest`.
 *
 *  Uses @capacitor/preferences rather than localStorage: it's the same
 *  WebView-backed store either way today, but Preferences is the
 *  Capacitor-recommended API for small persisted values and is what the rest of
 *  this app already reaches for (see NativeService's siblings), so this stays
 *  consistent rather than mixing storage APIs for no reason. */
@Injectable({ providedIn: 'root' })
export class DeviceIdService {
  async getOrCreateDeviceId(): Promise<string> {
    const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
    if (value) {
      return value;
    }

    const deviceId = crypto.randomUUID();
    await Preferences.set({ key: DEVICE_ID_KEY, value: deviceId });
    return deviceId;
  }

  /** Called on explicit logout so a fresh device identity (and therefore a fresh
   *  guest account) is created next launch, instead of silently re-attaching the
   *  identity the user just logged out of — see AuthService.logout(). */
  async clearDeviceId(): Promise<void> {
    await Preferences.remove({ key: DEVICE_ID_KEY });
  }
}
