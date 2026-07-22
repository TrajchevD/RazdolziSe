import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  BalanceResponse,
  PaymentResponse,
  RecordPaymentRequest,
  SettlementTransactionResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class SettlementService {
  private readonly apiUrl = `${API_BASE_URL}/trips`;

  constructor(private http: HttpClient) {}

  getBalances(tripId: string): Observable<BalanceResponse[]> {
    return this.http.get<BalanceResponse[]>(`${this.apiUrl}/${tripId}/balances`);
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
