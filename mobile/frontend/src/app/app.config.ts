import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { initializeGuestSession } from './core/guest-bootstrap';
import { initializeWebIdentity } from './core/identity-bootstrap';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Native-only guest auto-login — see guest-bootstrap.ts. Runs before the
    // router's first navigation, so a first-time native user never sees /login.
    provideAppInitializer(initializeGuestSession),
    // Web counterpart — see identity-bootstrap.ts. Each is a no-op on the
    // other's platform, so both are always registered rather than branching here.
    provideAppInitializer(initializeWebIdentity),
  ],
};
