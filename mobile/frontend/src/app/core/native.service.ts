import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { ThemeService } from './theme.service';

/** Everything that only exists because we're running inside a native shell
 *  (Capacitor), not a browser tab. Every call in here is guarded by
 *  `Capacitor.isNativePlatform()` so this service is a complete no-op — no
 *  crashes, no missing-plugin errors — if this same build is ever opened in a
 *  regular browser instead of the packaged app.
 *
 *  Root-provided and injected once from `App` (see app.ts), same pattern as
 *  ThemeService, so it wires up before first paint rather than waiting for
 *  some component to ask for it. */
@Injectable({ providedIn: 'root' })
export class NativeService {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  constructor() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    this.handleAndroidBackButton();
    this.syncStatusBarWithTheme();
    this.hideSplashScreenAfterFirstPaint();
  }

  /** Without this, Android's system back gesture/button closes the whole app the
   *  instant you're on a route with nowhere for Angular's router to go back to —
   *  standard native-app expectation is "back" walks up in-app history first and
   *  only exits the app from the trips list (the app's home screen). */
  private handleAndroidBackButton(): void {
    CapacitorApp.addListener('backButton', () => {
      const url = this.router.url;
      const atRoot = url === '/trips' || url === '/login' || url === '/register' || url === '/';

      if (atRoot) {
        CapacitorApp.exitApp();
      } else {
        window.history.back();
      }
    });
  }

  /** Keeps the OS status bar (clock/battery icons) legible against our own
   *  light/dark background instead of the Capacitor default, and re-applies
   *  whenever the user flips ThemeService's toggle — otherwise switching to dark
   *  mode in-app would leave black-on-black status bar icons. */
  private syncStatusBarWithTheme(): void {
    effect(() => {
      const dark = this.theme.isDark();
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {
        // Some Android OEM skins / older API levels don't support setStyle —
        // non-fatal, the status bar just keeps its default appearance.
      });
    });
  }

  /** capacitor.config.ts sets launchAutoHide: false-equivalent behavior by keeping
   *  the splash visible until this fires, so users see the branded splash instead
   *  of a flash of an unstyled/blank page while Angular's bundle parses and the
   *  auth guard resolves the first route. */
  private hideSplashScreenAfterFirstPaint(): void {
    requestAnimationFrame(() => {
      SplashScreen.hide().catch(() => {
        /* already hidden or plugin unavailable — fine either way */
      });
    });
  }
}
