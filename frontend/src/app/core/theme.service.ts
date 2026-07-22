import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'tripsplit_theme';

/** Applies a `data-theme="dark"|"light"` attribute to <html>, which the CSS custom
 *  properties in styles.scss key off of. Persists the choice in localStorage, and
 *  falls back to the OS-level preference (`prefers-color-scheme`) the first time a
 *  visitor shows up with no stored preference yet. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(this.readInitial());

  constructor() {
    // Runs once immediately (applying whatever we start with) and again any time
    // isDark() changes — this is the one place that touches the DOM/localStorage
    // for theme, so toggle() itself can stay a plain signal update.
    effect(() => {
      const dark = this.isDark();
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.isDark.set(!this.isDark());
  }

  private readInitial(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  }
}
