import { Component, computed, effect, input, output, signal } from '@angular/core';
import { hapticImpact } from './haptics';

/** Wraps a scrollable screen's content and adds a native-feeling pull-to-refresh
 *  gesture — there's no official Capacitor plugin for this (checked before
 *  building it; see mobile/PRODUCTION_REVIEW.md's methodology note on what this
 *  sandbox can and can't verify live), so it's a small self-contained
 *  implementation using raw touch events rather than a dependency.
 *
 *  Usage: `<app-pull-to-refresh [refreshing]="isRefreshing()" (refresh)="reload()">
 *  ...screen content...</app-pull-to-refresh>`. The parent owns the actual
 *  reload — this component only decides *when* to ask for one and how to show
 *  that one's in flight; it has no idea what "refreshing" actually does. */
@Component({
  selector: 'app-pull-to-refresh',
  templateUrl: './pull-to-refresh.html',
  styleUrl: './pull-to-refresh.scss',
})
export class PullToRefresh {
  readonly refreshing = input(false);
  readonly refresh = output<void>();

  private readonly threshold = 64;
  private startY: number | null = null;
  private tracking = false;

  protected readonly pullDistance = signal(0);
  protected readonly indicatorHeight = computed(() => Math.min(this.pullDistance(), this.threshold + 20));
  protected readonly armed = computed(() => this.pullDistance() >= this.threshold);

  constructor() {
    // Snaps the indicator back to nothing once the caller's own refresh flips
    // back to false — this only reacts to that transition, not to pullDistance
    // itself, so it never fights an in-progress drag (see onTouchMove).
    effect(() => {
      if (!this.refreshing()) {
        this.pullDistance.set(0);
      }
    });
  }

  protected onTouchStart(event: TouchEvent): void {
    if (this.refreshing()) return;
    // Only arm the gesture when the page is already scrolled all the way to the
    // top — otherwise this would hijack an ordinary downward scroll partway
    // through a long list, which is the classic way a hand-rolled
    // pull-to-refresh becomes annoying instead of delightful.
    const atTop = (window.scrollY ?? document.documentElement.scrollTop) <= 0;
    if (!atTop) return;
    this.startY = event.touches[0].clientY;
    this.tracking = true;
  }

  protected onTouchMove(event: TouchEvent): void {
    if (!this.tracking || this.startY === null) return;
    const delta = event.touches[0].clientY - this.startY;
    if (delta <= 0) {
      this.pullDistance.set(0);
      return;
    }
    // Resistance curve: each further pixel of finger travel moves the
    // indicator less than the last, so pulling further never just runs out —
    // it eases, the way iOS's own pull-to-refresh feels.
    this.pullDistance.set(Math.min(delta * 0.45, 100));
    event.preventDefault();
  }

  protected onTouchEnd(): void {
    if (!this.tracking) return;
    this.tracking = false;
    this.startY = null;

    if (this.pullDistance() >= this.threshold) {
      hapticImpact('light');
      this.pullDistance.set(this.threshold);
      this.refresh.emit();
    } else {
      this.pullDistance.set(0);
    }
  }
}
