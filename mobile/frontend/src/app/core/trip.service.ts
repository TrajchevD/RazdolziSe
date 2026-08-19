import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  AddGuestRequest,
  AddMemberRequest,
  ClaimMemberRequest,
  CreateTripRequest,
  JoinTripRequest,
  TripJoinPreviewResponse,
  TripResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class TripService {
  private readonly apiUrl = `${API_BASE_URL}/trips`;

  constructor(private http: HttpClient) {}

  createTrip(request: CreateTripRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(this.apiUrl, request);
  }

  getMyTrips(): Observable<TripResponse[]> {
    return this.http.get<TripResponse[]>(this.apiUrl);
  }

  getTrip(tripId: string): Observable<TripResponse> {
    return this.http.get<TripResponse>(`${this.apiUrl}/${tripId}`);
  }

  addMember(tripId: string, request: AddMemberRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(`${this.apiUrl}/${tripId}/members`, request);
  }

  addGuest(tripId: string, request: AddGuestRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(`${this.apiUrl}/${tripId}/guests`, request);
  }

  /** Joins a trip via its shareable code (see the "Trip code" card in the Members
   *  overlay) instead of waiting on an email invite. Simple self-add under the
   *  caller's own account/identity — no picker, no unclaimed-name matching (that's
   *  getJoinPreview/claimMember below, for the rich /join/:inviteToken flow). */
  joinByCode(request: JoinTripRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(`${this.apiUrl}/join`, request);
  }

  /** Backs the /join/:inviteToken screen (join/join-claim.ts). Requires an
   *  already-resolved identity (JWT or device cookie) — a truly fresh visitor's
   *  app initializer establishes one before this call ever fires (see
   *  guest-bootstrap.ts / identity-bootstrap.ts). If `callerMembership` on the
   *  response is non-null, the caller is already on this trip and the component
   *  skips straight to the trip instead of showing the picker. */
  getJoinPreview(inviteToken: string): Observable<TripJoinPreviewResponse> {
    return this.http.get<TripJoinPreviewResponse>(`${this.apiUrl}/join/${inviteToken}`);
  }

  /** One-time, permanent: claims an existing unclaimed name (`tripMemberId` set)
   *  or self-adds under a brand-new name (`newDisplayName` set) — exactly one of
   *  the two should be set on `request`. Race-safe server-side (see
   *  TripService.ClaimMemberAsync) — a 409 here means someone else claimed that
   *  same slot a moment earlier; the caller should re-fetch the preview. */
  claimMember(inviteToken: string, request: ClaimMemberRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(`${this.apiUrl}/join/${inviteToken}/claim`, request);
  }

  /** Owner-only — invalidates the old link/QR (anyone who hasn't claimed yet with
   *  it loses access) and mints a fresh `joinCode`. See the "Trip code" card's
   *  regenerate action in trip-detail.html. */
  regenerateInviteToken(tripId: string): Observable<TripResponse> {
    return this.http.post<TripResponse>(`${this.apiUrl}/${tripId}/invite-token/regenerate`, {});
  }

  deleteTrip(tripId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${tripId}`);
  }
}
