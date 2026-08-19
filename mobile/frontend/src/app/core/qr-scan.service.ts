import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/** Thin wrapper around @capacitor-mlkit/barcode-scanning's one-shot `scan()` —
 *  it presents its own native full-screen scan UI and resolves with the raw
 *  decoded text, so neither caller (Friends' "scan a friend" button, trip-list's
 *  "scan a trip code" button) needs any camera-preview UI of its own. Both QR
 *  kinds this app generates (a trip's join code, a profile's "Name#TAG") are
 *  plain text, not deep links — see trip-detail.ts's joinCodeQrUrl and
 *  profile.ts's identityQrUrl — so the raw scanned string IS the value to use,
 *  no parsing/URL-scheme handling needed on either side. */
@Injectable({ providedIn: 'root' })
export class QrScanService {
  /** Native-only — there's no camera to scan with in a browser tab, and this
   *  app has no web fallback UI for it (unlike the plugin's own web polyfill,
   *  which would need an extra `barcode-detector` package this app doesn't
   *  carry — see the plugin's README). Scan buttons check this before rendering
   *  at all, same pattern as BiometricLockService.isAvailable(). */
  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** Resolves with the scanned text, or null if the user cancelled or camera
   *  permission was denied — callers show their own message for the denied
   *  case rather than this service guessing at UI. */
  async scan(): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      const { camera: requested } = await BarcodeScanner.requestPermissions();
      if (requested !== 'granted' && requested !== 'limited') {
        return null;
      }
    }

    try {
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      return barcodes[0]?.rawValue ?? null;
    } catch {
      // User backed out of the native scan screen, or the plugin itself
      // errored (e.g. Google Play Services module missing) — either way,
      // "nothing scanned" is the right outcome, not a thrown error the caller
      // has to remember to catch.
      return null;
    }
  }
}
