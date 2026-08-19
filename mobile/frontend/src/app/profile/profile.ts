import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ThemeService } from '../core/theme.service';
import { BiometricLockService } from '../core/biometric-lock.service';
import { QrScanService } from '../core/qr-scan.service';
import { avatarColor, initials } from '../shared/avatar-color';
import { hapticImpact } from '../shared/haptics';

/** Real, working screen (unlike Friends/Analytics) — everything here already
 * existed, just scattered across trip-list's header (avatar/logout) and
 * theme.service.ts (the toggle). Consolidating it into its own tab is what the
 * imported design calls for, and it also frees up trip-list's header to just be
 * a header instead of doubling as a settings menu. */
@Component({
  selector: 'app-profile',
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  protected readonly authService = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly biometricLock = inject(BiometricLockService);
  protected readonly qrScan = inject(QrScanService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  // Only worth asking the device once (checkBiometry() is an actual native call,
  // not a cheap sync read) — the "Unlock with biometrics" row is hidden entirely
  // on web and on native devices with no biometry enrolled at all, rather than
  // shown disabled/greyed out.
  protected readonly showBiometricRow = signal(false);
  protected readonly isTogglingBiometric = signal(false);

  // Discord-style identity card — collapsed by default (an unread QR code
  // sitting on screen is just clutter for the common case of a user who never
  // needs to hand their tag to anyone).
  protected readonly showIdCard = signal(false);

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void this.biometricLock.isAvailable().then((available) => this.showBiometricRow.set(available));
    }
  }

  // "Save your account" form state — only ever shown/used for a guest user (see
  // profile.html), same validation shape as register.ts (8-char minimum enforced
  // in the template, matching register.html's `minlength="8"`).
  linkEmail = '';
  linkPassword = '';
  showLinkPassword = signal(false);
  isLinking = signal(false);
  linkError = signal<string | null>(null);

  // "Verify your email" banner state — only ever shown for a linked (non-guest),
  // not-yet-verified user (see profile.html). Two steps: send a code, then submit
  // it; codeSent toggles which half of the form renders.
  verifyCodeInput = '';
  codeSent = signal(false);
  isSendingCode = signal(false);
  isVerifyingCode = signal(false);
  verifyError = signal<string | null>(null);

  logout(): void {
    hapticImpact('medium');
    this.authService.logout();
  }

  toggleTheme(): void {
    hapticImpact('light');
    this.theme.toggle();
  }

  /** Same free api.qrserver.com approach as trip-detail's join-code QR (see
   *  that file's comment) — plain text, not a deep link, since this app has no
   *  URL-scheme handling. Encodes "DisplayName#TAG" as a shareable identity
   *  card someone could scan and type in elsewhere (e.g. an invite email). */
  identityQrUrl(): string {
    const user = this.authService.currentUser();
    const identity = `${user?.displayName ?? ''}#${user?.tag ?? ''}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(identity)}`;
  }

  /** The counterpart to "Show QR code" above: instead of showing yours for
   *  someone else to scan, jump straight to Friends and open its camera scanner
   *  (same scanToSearch() Friends already uses for its own 📷 button — see
   *  friends.ts) so scanning someone else's profile QR and sending them a
   *  request is one tap from here instead of "go find the scan button
   *  yourself." The `scan=1` param is how friends.ts knows to auto-open it;
   *  cleared from the URL immediately after, same pattern as trip-detail's
   *  `?open=expense`. */
  scanFriendCode(): void {
    hapticImpact('light');
    this.router.navigate(['/friends'], { queryParams: { scan: 1 } });
  }

  async toggleBiometricLock(): Promise<void> {
    const next = !this.biometricLock.enabled();
    this.isTogglingBiometric.set(true);

    try {
      await this.biometricLock.setEnabled(next);
      hapticImpact('medium');
      this.notifications.notify(
        next ? 'Biometric unlock turned on.' : 'Biometric unlock turned off.',
        'info',
      );
    } catch {
      // User cancelled the confirmation prompt, or the OS rejected it — leave
      // the toggle exactly where it was rather than guessing at a new state.
      this.notifications.notify('Could not verify — biometric unlock stayed off.', 'error');
    } finally {
      this.isTogglingBiometric.set(false);
    }
  }

  linkAccount(): void {
    this.linkError.set(null);
    this.isLinking.set(true);

    this.authService.linkAccount({ email: this.linkEmail, password: this.linkPassword }).subscribe({
      next: () => {
        this.isLinking.set(false);
        this.linkEmail = '';
        this.linkPassword = '';
        hapticImpact('medium');
        this.notifications.notify('Account saved — your trips are safe on any device now.', 'info');
      },
      error: (err) => {
        this.isLinking.set(false);
        this.linkError.set(err.error?.message ?? 'Could not save account. Please try again.');
      },
    });
  }

  sendVerificationCode(): void {
    this.verifyError.set(null);
    this.isSendingCode.set(true);

    this.authService.sendVerification().subscribe({
      next: () => {
        this.isSendingCode.set(false);
        this.codeSent.set(true);
        this.notifications.notify('Verification code sent — check your email.', 'info');
      },
      error: (err) => {
        this.isSendingCode.set(false);
        this.verifyError.set(err.error?.message ?? 'Could not send a verification code. Please try again.');
      },
    });
  }

  verifyEmailCode(): void {
    this.verifyError.set(null);
    this.isVerifyingCode.set(true);

    this.authService.verifyEmail({ code: this.verifyCodeInput }).subscribe({
      next: () => {
        this.isVerifyingCode.set(false);
        this.verifyCodeInput = '';
        this.codeSent.set(false);
        hapticImpact('medium');
        this.notifications.notify('Email verified!', 'info');
      },
      error: (err) => {
        this.isVerifyingCode.set(false);
        this.verifyError.set(err.error?.message ?? 'Invalid or expired code.');
      },
    });
  }
}
