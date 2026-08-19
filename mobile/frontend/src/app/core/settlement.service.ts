import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  BalanceResponse,
  PaymentResponse,
  RecordPaymentRequest,
  SettlementTransactionResponse,
  TripResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class SettlementService {
  private readonly apiUrl = `${API_BASE_URL}/trips`;

  constructor(private http: HttpClient) {}

  getBalances(tripId: string): Observable<BalanceResponse[]> {
    return this.http.get<BalanceResponse[]>(`${this.apiUrl}/${tripId}/balances`);
  }

  /** The signed-in user's own net balance in each of the given trips, keyed by
   *  trip id — one `getBalances` call per trip, forkJoin'd. Shared by both the
   *  Trips list and the Home dashboard (both need the same aggregate "overall"
   *  balance + per-trip chips) so the two screens can't quietly drift apart on
   *  how that number is computed. Small trip counts (a handful) make one call
   *  per trip perfectly fine — same reasoning trip-list.ts's original version
   *  of this had. */
  getMyBalancesByTrip(trips: TripResponse[], userId: string): Observable<Record<string, number>> {
    if (!userId || trips.length === 0) {
      return of({});
    }

    const requests = trips.map((trip) =>
      this.getBalances(trip.id).pipe(
        map((balances) => {
          const selfMember = trip.members.find((m) => m.userId === userId);
          const mine = selfMember ? balances.find((b) => b.tripMemberId === selfMember.tripMemberId) : undefined;
          return [trip.id, mine?.netBalance ?? 0] as [string, number];
        }),
      ),
    );

    return forkJoin(requests).pipe(map((entries) => Object.fromEntries(entries)));
  }

  getSettlementPlan(tripId: string): Observable<SettlementTransactionResponse[]> {
    return this.http.get<SettlementTransactionResponse[]>(`${this.apiUrl}/${tripId}/settlement-plan`);
  }

  getPayments(tripId: string): Observable<PaymentResponse[]> {
    return this.http.get<PaymentResponse[]>(`${this.apiUrl}/${tripId}/payments`);
  }

  recordPayment(tripId: string, request: RecordPaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(`${this.apiUrl}/${tripId}/payments`, request);
  }
}
