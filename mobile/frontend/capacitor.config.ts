import type { CapacitorConfig } from '@capacitor/cli';

// appId reversed-domain style — change to whatever you actually register in the
// Play Console / App Store Connect before you ship. Renaming it later means
// re-creating both app listings, so lock this in early.
const config: CapacitorConfig = {
  appId: 'com.davidtrajchev.razdolzise',
  appName: 'RazdolziSe',
  webDir: 'dist/frontend/browser',
  server: {
    // Only used for `npx cap run` live-reload during development against the
    // Angular dev server — remove/comment this whole `server` block for
    // production builds so the app loads the bundled `webDir` instead of
    // trying to reach your dev machine over the network.
    // url: 'http://192.168.1.X:4200',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // Manually dismissed by NativeService.hideSplashScreenAfterFirstPaint() once
      // Angular has actually painted, rather than a fixed timer — a fixed
      // launchShowDuration either flashes a blank page (too short) or holds the
      // splash needlessly after the app is already interactive (too long).
      launchAutoHide: false,
      backgroundColor: '#f7f7f5',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      // Overridden at runtime per-theme by theme.service.ts (light/dark), this is
      // just the initial value before Angular boots.
      style: 'DARK',
    },
  },
};

export default config;
