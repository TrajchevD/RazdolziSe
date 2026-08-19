import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

const MOBILE_BREAKPOINT = '(max-width: 640px)';

/** Single source of truth for "are we on a phone-sized screen right now" — both
 *  trip-list and trip-detail read this signal to switch between the mobile
 *  redesign and the existing desktop layout (and App reads it to decide whether
 *  to show the bottom tab bar), instead of each maintaining its own resize
 *  listener. Root-provided, so the listener lives for the app's lifetime.
 *
 *  Inside the packaged native app this is always true, full stop — a phone
 *  turned sideways is still a phone. Without the Capacitor.isNativePlatform()
 *  check, a plain `max-width: 640px` media query goes FALSE in landscape (an
 *  iPhone in landscape is ~700-930px wide), which would silently swap in the
 *  desktop grid layout and hide the tab bar the moment someone rotates their
 *  phone. The width-based query is still exactly right for the *web* build,
 *  where this genuinely is "is the browser window phone-narrow." */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly isNative = Capacitor.isNativePlatform();
  private readonly mediaQuery = typeof window !== 'undefined' ? window.matchMedia(MOBILE_BREAKPOINT) : null;

  readonly isMobile = signal(this.isNative || (this.mediaQuery?.matches ?? false));

  constructor() {
    if (this.isNative) {
      return;
    }
    this.mediaQuery?.addEventListener('change', (event) => this.isMobile.set(event.matches));
  }
}
