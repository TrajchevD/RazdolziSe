import { Component, inject, signal } from '@angular/core';
import { BiometricLockService } from '../core/biometric-lock.service';
import { hapticImpact, hapticNotification } from './haptics';

/** Full-screen overlay rendered by App (app.html) whenever
 *  BiometricLockService.isLocked() is true. Auto-prompts on mount so the common
 *  case (Face ID just works) needs zero taps — the button only matters for
 *  retrying after a cancel/failure, or for a first tap on Android where the
 *  system fingerprint sheet won't appear until requested. */
@Component({
  selector: 'app-biometric-lock-screen',
  imports: [],
  templateUrl: './biometric-lock-screen.html',
  styleUrl: './biometric-lock-screen.scss',
})
export class BiometricLockScreen {
  protected readonly biometricLock = inject(BiometricLockService);
  protected readonly failed = signal(false);

  constructor() {
    void this.attemptUnlock();
  }

  async attemptUnlock(): Promise<void> {
    this.failed.set(false);
    const success = await this.biometricLock.unlock();
    if (success) {
      hapticNotification('success');
    } else {
      this.failed.set(true);
    }
  }

  retry(): void {
    hapticImpact('light');
    void this.attemptUnlock();
  }
}
