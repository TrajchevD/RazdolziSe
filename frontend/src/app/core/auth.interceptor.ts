import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

const TOKEN_KEY = 'tripsplit_token';

/** Attaches the JWT to every outgoing request, and globally handles a 401 response
 *  (expired/invalid token) by clearing the stored session and bouncing to /login —
 *  without this, every request after a token expires would silently 401 forever
 *  with no feedback, since most call sites only render errors from their own form. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const notifications = inject(NotificationService);

  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((err) => {
      // Only treat this as "session expired" if we actually sent a token — a 401 on
      // the login/register calls themselves (wrong password, etc.) is a normal form
      // error that the calling component already handles, not a session problem.
      if (err?.status === 401 && token) {
        authService.logout();
        notifications.notify('Your session expired — please log in again.');
      }
      return throwError(() => err);
    }),
  );
};
