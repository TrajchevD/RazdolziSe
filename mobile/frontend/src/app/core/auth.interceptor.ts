import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

const TOKEN_KEY = 'tripsplit_token';

/** Requests this interceptor must never try to "refresh and retry" on. login/
 *  register/guest are all anonymous endpoints, so in practice they can't
 *  actually 401 through this path at all — a wrong password there throws
 *  UnauthorizedAccessException, which ExceptionHandlingMiddleware maps to 403,
 *  not 401 (see that file). They're still listed here as a deliberate
 *  belt-and-suspenders guard in case that mapping ever changes. /auth/refresh
 *  is the one that matters for a different reason: it can genuinely 401 (an
 *  expired/revoked refresh token), and retrying a failed refresh by calling
 *  refresh() again would just recurse forever. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/guest', '/auth/refresh'];

/** Attaches the JWT to every outgoing request. The 401 this actually exists to
 *  catch comes from ASP.NET's own JWT bearer middleware rejecting an expired
 *  access token on an [Authorize]-protected endpoint (JWT is a hard 120-minute
 *  wall — see AuthService.BuildAuthResponseAsync) — that happens before the
 *  request ever reaches a controller action, so it's a framework-level 401,
 *  never the app's own ExceptionHandlingMiddleware (which maps auth failures
 *  to 403, see AUTH_ENDPOINTS' comment). On that 401, this transparently trades
 *  the stored refresh token for a new one via AuthService.refresh() and retries
 *  the original request once, instead of immediately bouncing the user to
 *  /login. Only falls back to the old "clear session, show /login" behavior if
 *  the refresh itself also fails (refresh token expired/revoked too — a real
 *  session end, not just an access token due for its normal rotation). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const notifications = inject(NotificationService);

  const token = localStorage.getItem(TOKEN_KEY);
  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));

  // withCredentials on every request (not just identity/bootstrap) so the
  // httpOnly DeviceToken cookie — see identity.service.ts — rides along
  // automatically once the server has set it, exactly like a browser would do
  // for a same-site cookie. Required here specifically because the API and web
  // frontend are on different domains in production (tripsplit-api.onrender.com
  // vs razdolzise.vercel.app); the backend's CORS policy allows credentials
  // from that one known origin to match (see Program.cs). Harmless to set on
  // JWT-authenticated / native requests — there's no cookie for them to send.
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
  } else {
    req = req.clone({ withCredentials: true });
  }

  return next(req).pipe(
    catchError((err) => {
      // Only relevant if we actually sent a token — nothing to refresh otherwise.
      if (err?.status !== 401 || !token) {
        return throwError(() => err);
      }

      if (isAuthEndpoint || !authService.refreshToken) {
        authService.logout();
        notifications.notify('Your session expired — please log in again.');
        return throwError(() => err);
      }

      return authService.refresh().pipe(
        switchMap((res) => {
          const retried = req.clone({ setHeaders: { Authorization: `Bearer ${res.token}` } });
          return next(retried);
        }),
        catchError((refreshErr) => {
          authService.logout();
          notifications.notify('Your session expired — please log in again.');
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
