import { Injectable, signal } from '@angular/core';

const MOBILE_BREAKPOINT = '(max-width: 640px)';

/** Single source of truth for "are we on a phone-sized screen right now" — both
 *  trip-list and trip-detail read this signal to switch between the mobile
 *  redesign and the existing desktop layout, instead of each maintaining its own
 *  resize listener. Root-provided, so the listener lives for the app's lifetime. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly mediaQuery = typeof window !== 'undefined' ? window.matchMedia(MOBILE_BREAKPOINT) : null;

  readonly isMobile = signal(this.mediaQuery?.matches ?? false);

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => this.isMobile.set(event.matches));
  }
}
