import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  FriendRequestResponse,
  FriendResponse,
  SearchUserRequest,
  SendFriendRequestRequest,
  UserSummaryResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/friends`;

  /** Shared so the trip-detail Members panel (see "Add friend" wiring) and the
   *  Friends tab both know the current friend/pending state without each
   *  re-fetching separately — cross-referencing trip members against this list
   *  is exactly how trip-detail decides whether to show "Add friend", "Pending",
   *  or nothing for a given member. */
  readonly friends = signal<FriendResponse[]>([]);
  readonly incomingRequests = signal<FriendRequestResponse[]>([]);
  readonly outgoingRequests = signal<FriendRequestResponse[]>([]);

  refreshFriends(): Observable<FriendResponse[]> {
    return this.http.get<FriendResponse[]>(this.apiUrl).pipe(tap((list) => this.friends.set(list)));
  }

  refreshIncomingRequests(): Observable<FriendRequestResponse[]> {
    return this.http
      .get<FriendRequestResponse[]>(`${this.apiUrl}/requests/incoming`)
      .pipe(tap((list) => this.incomingRequests.set(list)));
  }

  refreshOutgoingRequests(): Observable<FriendRequestResponse[]> {
    return this.http
      .get<FriendRequestResponse[]>(`${this.apiUrl}/requests/outgoing`)
      .pipe(tap((list) => this.outgoingRequests.set(list)));
  }

  search(request: SearchUserRequest): Observable<UserSummaryResponse> {
    return this.http.post<UserSummaryResponse>(`${this.apiUrl}/search`, request);
  }

  sendRequest(request: SendFriendRequestRequest): Observable<FriendRequestResponse> {
    return this.http.post<FriendRequestResponse>(`${this.apiUrl}/requests`, request).pipe(
      tap(() => {
        this.refreshOutgoingRequests().subscribe({ error: () => {} });
        // Also covers the instant-accept case (see FriendService.SendRequestAsync,
        // backend): if the other person had already requested us first, this call
        // resolves straight to an accepted friendship instead of a new pending
        // row — refreshOutgoingRequests alone wouldn't show that anywhere.
        this.refreshFriends().subscribe({ error: () => {} });
      }),
    );
  }

  accept(friendshipId: string): Observable<FriendResponse> {
    return this.http.post<FriendResponse>(`${this.apiUrl}/requests/${friendshipId}/accept`, {}).pipe(
      tap(() => {
        this.incomingRequests.update((list) => list.filter((r) => r.id !== friendshipId));
        this.refreshFriends().subscribe({ error: () => {} });
      }),
    );
  }

  decline(friendshipId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/requests/${friendshipId}/decline`, {}).pipe(
      tap(() => {
        this.incomingRequests.update((list) => list.filter((r) => r.id !== friendshipId));
        this.outgoingRequests.update((list) => list.filter((r) => r.id !== friendshipId));
      }),
    );
  }

  remove(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userId}`).pipe(
      tap(() => this.friends.update((list) => list.filter((f) => f.userId !== userId))),
    );
  }
}
