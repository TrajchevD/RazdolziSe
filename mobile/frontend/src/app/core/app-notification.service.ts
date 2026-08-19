import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { NotificationResponse } from './api.models';

/** "AppNotification" (not just "Notification") to keep this distinct from
 *  core/notification.service.ts's NotificationService, which is an unrelated
 *  concept — an ephemeral toast queue for local UI feedback, not this
 *  server-backed inbox of payment-received rows and inactivity nudges. */
@Injectable({ providedIn: 'root' })
export class AppNotificationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/notifications`;

  /** Shared app-wide so the header bell badge (trip-list.ts) and the full
   *  inbox screen (notifications.ts) both read the same list instead of each
   *  fetching their own copy. */
  readonly notifications = signal<NotificationResponse[]>([]);

  /** Both kinds count toward the badge — a nudge stays "unread" for as long as
   *  its underlying condition (money owed, no recent activity) holds, which is
   *  exactly right: there's nothing to "read" and dismiss about a fact that's
   *  still true. See NotificationResponse.kind. */
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);

  refresh(): Observable<NotificationResponse[]> {
    return this.http.get<NotificationResponse[]>(this.apiUrl).pipe(tap((list) => this.notifications.set(list)));
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() =>
        this.notifications.update((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n))),
      ),
    );
  }

  /** Permanently removes a persisted (markable) notification — see
   *  notifications.ts's isMarkable/isDeletable for why an InactivityNudge never
   *  reaches this (it has no row to delete in the first place). */
  deleteNotification(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.notifications.update((list) => list.filter((n) => n.id !== id))),
    );
  }
}
