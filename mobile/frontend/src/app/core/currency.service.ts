import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { CurrencySuggestionResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly apiUrl = `${API_BASE_URL}/currency`;

  constructor(private http: HttpClient) {}

  // IP-geolocation-based default (e.g. EU -> EUR, North Macedonia -> MKD) — just a
  // suggestion to pre-fill a currency dropdown with, never authoritative.
  suggestCurrency(): Observable<CurrencySuggestionResponse> {
    return this.http.get<CurrencySuggestionResponse>(`${this.apiUrl}/suggest`);
  }
}
