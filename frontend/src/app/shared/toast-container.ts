import { Component, inject } from '@angular/core';
import { NotificationService } from '../core/notification.service';

/** Renders the app-wide toast queue (see NotificationService). Mounted once in
 *  app.html so it's available on every page without each component wiring it up. */
@Component({
  selector: 'app-toast-container',
  template: `
    @if (notifications.toasts().length > 0) {
      <div class="toast-stack">
        @for (toast of notifications.toasts(); track toast.id) {
          <div class="toast" [class.info]="toast.kind === 'info'" (click)="notifications.dismiss(toast.id)">
            {{ toast.message }}
          </div>
        }
      </div>
    }
  `,
  styles: `
    /* Anchored to the TOP of the screen rather than the bottom: every page's bottom
     * edge is already busy on mobile (FAB, settle-up CTA, sticky overlay footers with
     * Save/Delete buttons), so a bottom toast would sit on top of those. The top is
     * clear on every screen this renders over. */
    .toast-stack {
      position: fixed;
      left: 1rem;
      right: 1rem;
      top: 1rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
    }

    .toast {
      max-width: 28rem;
      width: 100%;
      background: #b00020;
      color: white;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      cursor: pointer;

      &.info {
        background: #1f4e79;
      }
    }
  `,
})
export class ToastContainer {
  protected readonly notifications = inject(NotificationService);
}
