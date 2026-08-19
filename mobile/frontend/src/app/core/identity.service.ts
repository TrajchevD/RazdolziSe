import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { IdentityResponse } from './api.models';

// Not a security boundary — just a client-side hint so authGuard and the UI
// know a device identity likely already exists before the first request comes
// back. The httpOnly DeviceToken cookie is the only thing that actually proves
// anything; this flag can't be forged into real access because every endpoint
// re-resolves identity from the cookie/JWT server-side regardless of what this
// says. Cleared on logout for the same "don't silently re-attach" reason
// device-id.service.ts clears its native counterpart.
const HAS_IDENTITY_KEY = 'tripsplit_has_identity';

/** Web counterpart to DeviceIdService/guest-bootstrap.ts's native guest flow.
 *  On the web there's no client-generated device id to send — the browser's
 *  own cookie jar is the persistence layer, and the server generates+hashes
 *  the secret (see backend SecureTokenGenerator/IdentityService). This service
 *  just triggers that cookie to be issued (or silently reused) and tracks
 *  whether it has been. */
@Injectable({ providedIn: 'root' })
export class IdentityService {
  private readonly apiUrl = `${API_BASE_URL}/identity`;

  readonly hasIdentity = signal<boolean>(localStorage.getItem(HAS_IDENTITY_KEY) === '1');

  constructor(private http: HttpClient) {}

  /** Idempotent — safe to call on every app start (see identity-bootstrap.ts).
   *  A repeat call with a still-valid cookie just returns the same identity
   *  instead of minting a new one (see backend IdentityController). Requires
   *  withCredentials (see auth.interceptor.ts) since the API and web frontend
   *  are on different domains in production. */
  bootstrap(): Observable<IdentityResponse> {
    return this.http.post<IdentityResponse>(`${this.apiUrl}/bootstrap`, {}).pipe(
      tap(() => {
        localStorage.setItem(HAS_IDENTITY_KEY, '1');
        this.hasIdentity.set(true);
      }),
    );
  }

  me(): Observable<IdentityResponse> {
    return this.http.get<IdentityResponse>(`${this.apiUrl}/me`);
  }

  clear(): void {
    localStorage.removeItem(HAS_IDENTITY_KEY);
    this.hasIdentity.set(false);
  }
}
