import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { CreateInviteRequest, TripInviteResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class TripInviteService {
  private readonly apiUrl = `${API_BASE_URL}/invites`;

  constructor(private http: HttpClient) {}

  sendInvite(tripId: string, request: CreateInviteRequest): Observable<TripInviteResponse> {
    return this.http.post<TripInviteResponse>(`${API_BASE_URL}/trips/${tripId}/invites`, request);
  }

  getMyInvites(): Observable<TripInviteResponse[]> {
    return this.http.get<TripInviteResponse[]>(this.apiUrl);
  }

  accept(inviteId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${inviteId}/accept`, {});
  }

  decline(inviteId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${inviteId}/decline`, {});
  }
}
