import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';

/** Two-step flow in one screen, same pattern as Profile's verify-email card:
 *  step 1 requests a code (always the same response whether or not the email
 *  has an account — see AuthService.forgotPassword), step 2 submits that code
 *  plus a new password. Kept as one route/component rather than two so the
 *  email the user typed in step 1 doesn't need to be re-entered or passed
 *  through query params for step 2. */
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  email = '';
  code = '';
  newPassword = '';
  showPassword = signal(false);

  codeSent = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
    private notifications: NotificationService,
  ) {}

  requestCode(): void {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService.forgotPassword({ email: this.email }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.codeSent.set(true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  resetPassword(): void {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService.resetPassword({ email: this.email, code: this.code, newPassword: this.newPassword }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.notifications.notify('Password reset — log in with your new password.', 'info');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not reset your password. Please try again.');
      },
    });
  }
}
