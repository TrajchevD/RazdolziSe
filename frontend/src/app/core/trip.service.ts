import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { AddGuestRequest, AddMemberRequest, CreateTripRequest, TripResponse } from './api.models';

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
}
