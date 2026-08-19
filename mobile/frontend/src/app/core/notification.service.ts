import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

/** App-wide notification queue for failures that don't have an obvious local place
 *  to show an error — e.g. a background refresh failing, or a session expiring.
 *  Per-form failures (submitting an add-expense form, logging in, etc.) should keep
 *  using their own local `<p class="error">` signal instead of this: it's more
 *  precise right next to the field that failed. This is for everything else. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  notify(message: string, kind: Toast['kind'] = 'error'): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, message, kind }]);

    // Auto-dismiss after a few seconds so toasts don't pile up forever if the user
    // doesn't interact with them.
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
