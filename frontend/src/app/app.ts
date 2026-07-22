import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainer } from './shared/toast-container';
import { ConfirmDialogHost } from './shared/confirm-dialog-host';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer, ConfirmDialogHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Injected (rather than left unused) purely so the service constructs immediately
  // on app bootstrap and applies the saved/preferred theme before first paint,
  // instead of waiting for some later component to first ask for it.
  private readonly theme = inject(ThemeService);
}
