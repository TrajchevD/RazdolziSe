import { Component, inject } from '@angular/core';
import { ConfirmDialogService } from '../core/confirm-dialog.service';

/** Renders the single pending confirm() request, if any (see ConfirmDialogService).
 *  Mounted once in app.html, same pattern as ToastContainer. */
@Component({
  selector: 'app-confirm-dialog-host',
  template: `
    @if (dialogs.request(); as req) {
      <div class="confirm-backdrop" (click)="dialogs.respond(false)">
        <div class="confirm-card" (click)="$event.stopPropagation()">
          <p>{{ req.message }}</p>
          <div class="confirm-actions">
            <button type="button" class="cancel" (click)="dialogs.respond(false)">Cancel</button>
            <button type="button" [class.danger]="req.danger" (click)="dialogs.respond(true)">{{ req.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .confirm-card {
      background: white;
      border-radius: 12px;
      padding: 1.25rem;
      max-width: 22rem;
      width: 100%;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);

      p {
        margin: 0 0 1rem;
        font-size: 0.95rem;
        color: #222;
      }
    }

    .confirm-actions {
      display: flex;
      gap: 0.6rem;
      justify-content: flex-end;

      button {
        min-height: 40px;
        padding: 0 1rem;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        background: #111;
        color: white;

        &.cancel {
          background: #ebebe8;
          color: #333;
        }

        &.danger {
          background: #b00020;
        }
      }
    }
  `,
})
export class ConfirmDialogHost {
  protected readonly dialogs = inject(ConfirmDialogService);
}
