import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';

/** Blocks the app's protected screens for anyone without a session, sending
 *  them to /login instead. "A session" means either a real JWT (registered
 *  login, or native's guest — see guest-bootstrap.ts) or, on web, a
 *  bootstrapped anonymous device identity (see identity-bootstrap.ts) — an
 *  anonymous web visitor who's never logged in still needs to reach /trips to
 *  create a trip and become its Owner, or /join/:inviteToken's redirect target
 *  after claiming a slot. The backend enforces the real security boundary
 *  either way (JWT or DeviceToken cookie) — this guard is just about not
 *  showing a logged-out user a broken page. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const identity = inject(IdentityService);
  const router = inject(Router);

  if (auth.isLoggedIn || identity.hasIdentity()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
