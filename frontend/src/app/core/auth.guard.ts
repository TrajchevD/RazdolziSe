import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Blocks /trips and /trips/:id for anyone without a token, sending them to
 *  /login instead. The backend enforces the real security boundary — this guard
 *  is just about not showing a logged-out user a broken page. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
