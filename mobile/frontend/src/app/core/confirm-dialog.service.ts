import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

/** In-app replacement for the browser's native `confirm()` — that popup looks jarring
 *  next to the rest of the app's custom UI and can't be styled at all. Components call
 *  `confirm(message)` and `await` the result, same shape as the native function, just
 *  rendered through ConfirmDialogHost (mounted once in app.html) instead. */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly request = signal<ConfirmRequest | null>(null);

  confirm(message: string, options?: { confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.request.set({
        message,
        confirmLabel: options?.confirmLabel ?? 'Confirm',
        danger: options?.danger ?? false,
        resolve,
      });
    });
  }

  respond(confirmed: boolean): void {
    this.request()?.resolve(confirmed);
    this.request.set(null);
  }
}
