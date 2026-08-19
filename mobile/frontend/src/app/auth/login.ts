import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DeviceIdService } from '../core/device-id.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';
  errorMessage = signal<string | null>(null);
  isSubmitting = signal(false);
  showPassword = signal(false);

  // "Continue as guest" — same device-id + POST /api/auth/guest flow
  // join-claim.ts's continueAsGuest() uses when someone lands via a shared
  // trip link, just reachable directly from the login screen now instead of
  // only after opening an invite. showGuestForm toggles a name field into view
  // rather than guessing a display name for them.
  showGuestForm = signal(false);
  guestNameInput = '';
  isContinuingAsGuest = signal(false);
  guestError = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private deviceIdService: DeviceIdService,
  ) {}

  submit(): void {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        // Set by join-claim.ts's goToLogin() when someone hit a /join/:code
        // link while signed out — send them back to finish claiming their spot
        // instead of dropping them on the dashboard. '/home' bounces straight
        // back to '/trips' on desktop (see home.ts's ngOnInit) — routing there
        // directly (rather than to '/trips') just means mobile lands on the
        // new dashboard instead of an extra redirect hop, same as before.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/home');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Login failed. Please try again.');
      },
    });
  }

  toggleGuestForm(): void {
    this.guestError.set(null);
    this.showGuestForm.set(!this.showGuestForm());
  }

  async continueAsGuest(): Promise<void> {
    if (this.isContinuingAsGuest() || !this.guestNameInput.trim()) {
      return;
    }
    this.guestError.set(null);
    this.isContinuingAsGuest.set(true);

    try {
      const deviceId = await this.deviceIdService.getOrCreateDeviceId();
      await firstValueFrom(this.authService.guest({ deviceId, displayName: this.guestNameInput.trim() }));
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl ?? '/home');
    } catch (err: any) {
      this.guestError.set(err?.error?.message ?? 'Could not start a guest session — check your connection and try again.');
    } finally {
      this.isContinuingAsGuest.set(false);
    }
  }
}
