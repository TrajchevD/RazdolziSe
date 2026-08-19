import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DeviceIdService } from '../core/device-id.service';
import { TripJoinPreviewResponse } from '../core/api.models';
import { TripService } from '../core/trip.service';
import { avatarColor, initials } from '../shared/avatar-color';

/** Landing screen for a scanned QR / shared link — `/join/:inviteToken` (see
 *  app.routes.ts). Not behind authGuard: a truly fresh visitor may have no
 *  identity at all yet, and getJoinPreview below is intentionally reachable
 *  anonymously (see TripsController.GetJoinPreview) so the trip name always
 *  renders first, before anyone has to decide how to continue.
 *
 *  On native, guest-bootstrap.ts's app initializer has typically already
 *  logged the visitor in as a guest before this component even activates, so
 *  isAuthenticated() below is already true and the picker shows immediately —
 *  the auth-choice step only actually appears for a not-yet-authenticated web
 *  visitor (which is also the only case that matters for a link opened on a
 *  desktop browser rather than through the native app).
 *
 *  Once authenticated (guest, login, or register), three outcomes: (1) the
 *  caller's identity is already on this trip — callerMembership comes back
 *  non-null, skip straight in; (2) it isn't — welcome them by their own
 *  already-known name (account name, or whatever they typed into "Continue
 *  as Guest") with a one-click "Join as {name}" (joinAsSelf), offering any
 *  unclaimed pre-added names as the alternative ("Or are you one of
 *  these?"); (3) a small "Use a different name for this trip" link reveals
 *  the old typed-name self-add form as an escape hatch (there's no per-trip
 *  restriction on this in the current model, see TripService.ClaimMemberAsync). */
@Component({
  selector: 'app-join-claim',
  imports: [FormsModule, RouterLink],
  templateUrl: './join-claim.html',
  styleUrl: './join-claim.scss',
})
export class JoinClaim implements OnInit {
  protected readonly avatarColor = avatarColor;
  protected readonly initials = initials;

  inviteToken = '';
  preview = signal<TripJoinPreviewResponse | null>(null);
  newDisplayName = '';

  isLoadingPreview = signal(true);
  isClaiming = signal(false);
  claimingMemberId = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  /** Reactive rather than a one-off `authService.isLoggedIn` check — reading
   *  the signal means the template flips from the auth-choice step to the
   *  picker the instant continueAsGuest() (or a login/register redirect back
   *  here) stores a session, with no manual re-check needed. */
  isAuthenticated = computed(() => !!this.authService.currentUser());

  /** The name to greet an already-authenticated visitor with, and the name a
   *  one-click "Join as {name}" self-add uses — their real account name if
   *  logged in/registered, or whatever they typed (or "Guest XXXX") if they
   *  continued as guest. */
  myDisplayName = computed(() => this.authService.currentUser()?.displayName ?? '');

  // Typed once, before continueAsGuest() trades the device id for a session —
  // see that method. Not needed at all for login/register, since those already
  // carry a real name on the account.
  guestNameInput = '';
  isContinuingAsGuest = signal(false);
  guestError = signal<string | null>(null);

  /** Escape hatch for "Welcome, {name}! Join as {name}?" — reveals the old
   *  typed-name form for the rare case someone wants to go by a different name
   *  on this specific trip than their account/guest name. Collapsed by default
   *  now that joinAsSelf()/the premade-guest picker cover the common cases
   *  without ever asking for typed input. */
  showSelfAddForm = signal(false);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private deviceIdService: DeviceIdService,
    private tripService: TripService,
  ) {}

  ngOnInit(): void {
    this.inviteToken = this.route.snapshot.paramMap.get('inviteToken') ?? '';
    this.loadPreview();
  }

  private loadPreview(): void {
    this.isLoadingPreview.set(true);
    this.errorMessage.set(null);

    this.tripService.getJoinPreview(this.inviteToken).subscribe({
      next: (result) => {
        this.isLoadingPreview.set(false);
        this.preview.set(result);

        // Already on this trip (rejoining a link, or claimed earlier from this
        // same guest/account) — no picker needed, go straight in.
        if (result.callerMembership) {
          this.router.navigate(['/trips', result.tripId]);
        }
      },
      error: (err) => {
        this.isLoadingPreview.set(false);
        this.errorMessage.set(
          err.status === 404
            ? 'This invite link is invalid or has been deactivated.'
            : (err.error?.message ?? 'Could not load this invite. Please try again.'),
        );
      },
    });
  }

  /** "Continue as Guest" — trades a per-device id for a JWT exactly like
   *  guest-bootstrap.ts's native flow does, just triggered explicitly by a tap
   *  instead of silently on app start (see DeviceIdService — it already works
   *  the same in a browser tab as in the native shell, no separate web-only
   *  mechanism needed). Whatever was typed into guestNameInput is sent along
   *  as the new guest's real display name (see backend AuthService.GuestAsync)
   *  — it's only actually used the first time this device id is seen; a
   *  returning guest device keeps its existing name regardless of what's
   *  typed here. Re-loads the preview afterward rather than just flipping
   *  isAuthenticated locally, so a returning guest device that already
   *  claimed a slot here skips straight into the trip instead of re-showing
   *  the picker. */
  async continueAsGuest(): Promise<void> {
    if (this.isContinuingAsGuest() || !this.guestNameInput.trim()) {
      return;
    }
    this.isContinuingAsGuest.set(true);
    this.guestError.set(null);

    try {
      const deviceId = await this.deviceIdService.getOrCreateDeviceId();
      await firstValueFrom(this.authService.guest({ deviceId, displayName: this.guestNameInput.trim() }));
      this.loadPreview();
    } catch {
      this.guestError.set('Could not continue as guest. Please try again.');
    } finally {
      this.isContinuingAsGuest.set(false);
    }
  }

  /** Sends the visitor to log in/register with their real account, then
   *  straight back here to finish the same claim flow — see login.ts/
   *  register.ts's returnUrl handling. */
  goToLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: `/join/${this.inviteToken}` } });
  }

  goToRegister(): void {
    this.router.navigate(['/register'], { queryParams: { returnUrl: `/join/${this.inviteToken}` } });
  }

  /** One-click self-add using the visitor's own already-known name (their
   *  account name, or whatever they typed into "Continue as Guest") — the
   *  primary action once authenticated, so nobody who isn't on the premade
   *  list has to type anything. Same underlying self-add as claimAsNewMember,
   *  just with the name pre-filled instead of asked for. */
  joinAsSelf(): void {
    if (this.isClaiming() || !this.myDisplayName()) {
      return;
    }
    this.claim({ tripMemberId: null, newDisplayName: this.myDisplayName() }, null);
  }

  toggleSelfAddForm(): void {
    this.showSelfAddForm.update((v) => !v);
  }

  claimSlot(tripMemberId: string): void {
    if (this.isClaiming()) {
      return;
    }
    this.claim({ tripMemberId, newDisplayName: null }, tripMemberId);
  }

  claimAsNewMember(): void {
    if (this.isClaiming() || !this.newDisplayName.trim()) {
      return;
    }
    this.claim({ tripMemberId: null, newDisplayName: this.newDisplayName.trim() }, null);
  }

  private claim(request: { tripMemberId: string | null; newDisplayName: string | null }, memberId: string | null): void {
    this.isClaiming.set(true);
    this.claimingMemberId.set(memberId);
    this.errorMessage.set(null);

    this.tripService.claimMember(this.inviteToken, request).subscribe({
      next: (trip) => {
        this.router.navigate(['/trips', trip.id]);
      },
      error: (err) => {
        this.isClaiming.set(false);
        this.claimingMemberId.set(null);
        this.errorMessage.set(
          err.status === 409
            ? 'Someone just claimed that spot — pick another name or refresh.'
            : (err.error?.message ?? 'Could not join this trip. Please try again.'),
        );
        // A 409 (or the in-memory-checked 400 for the same race — see
        // TripService.ClaimMemberAsync) means our picker is stale — refresh it
        // so the taken name disappears instead of letting the user retry the
        // same doomed claim.
        if (err.status === 409 || err.status === 400) {
          this.loadPreview();
        }
      },
    });
  }
}
