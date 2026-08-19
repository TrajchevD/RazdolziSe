import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { CreateExpenseRequest, ExpenseResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly apiUrl = `${API_BASE_URL}/trips`;

  constructor(private http: HttpClient) {}

  getExpenses(tripId: string): Observable<ExpenseResponse[]> {
    return this.http.get<ExpenseResponse[]>(`${this.apiUrl}/${tripId}/expenses`);
  }

  addExpense(tripId: string, request: CreateExpenseRequest): Observable<ExpenseResponse> {
    return this.http.post<ExpenseResponse>(`${this.apiUrl}/${tripId}/expenses`, request);
  }

  updateExpense(tripId: string, expenseId: string, request: CreateExpenseRequest): Observable<ExpenseResponse> {
    return this.http.put<ExpenseResponse>(`${this.apiUrl}/${tripId}/expenses/${expenseId}`, request);
  }

  deleteExpense(tripId: string, expenseId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${tripId}/expenses/${expenseId}`);
  }
}
