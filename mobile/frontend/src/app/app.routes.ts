import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Login } from './auth/login';
import { Register } from './auth/register';
import { ForgotPassword } from './auth/forgot-password';
import { Home } from './home/home';
import { TripList } from './trips/trip-list';
import { TripDetail } from './trips/trip-detail';
import { Friends } from './friends/friends';
import { Analytics } from './analytics/analytics';
import { Profile } from './profile/profile';
import { Notifications } from './notifications/notifications';
import { JoinClaim } from './join/join-claim';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'forgot-password', component: ForgotPassword },
  // Reached from a scanned QR / shared trip link — never authGuard-gated,
  // since a brand-new visitor may have no identity yet at all; the component
  // itself establishes one (see join-claim.ts's ensureIdentity) before doing
  // anything else.
  { path: 'join/:inviteToken', component: JoinClaim },
  // Mobile-only landing screen — Home itself bounces desktop visitors straight to
  // /trips in ngOnInit (see home.ts), so desktop's own landing behavior is
  // unchanged despite the redirect above now pointing here first.
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'trips', component: TripList, canActivate: [authGuard] },
  { path: 'trips/:id', component: TripDetail, canActivate: [authGuard] },
  // The old standalone Requests tab folded into Friends (see friends.ts) —
  // this redirect defends any stale deep link/bookmark instead of 404ing it.
  { path: 'requests', redirectTo: 'friends', pathMatch: 'full' },
  // Reachable from the bottom tab bar (app/shared/tab-bar.ts). Friends is a
  // real, working screen — Analytics is still an honest placeholder, it needs
  // backend aggregation work the others didn't.
  { path: 'friends', component: Friends, canActivate: [authGuard] },
  { path: 'analytics', component: Analytics, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  // Not a tab — reached via the bell icon in trip-list's header, same "pushed
  // screen with a back arrow" pattern as trips/:id.
  { path: 'notifications', component: Notifications, canActivate: [authGuard] },
  { path: '**', redirectTo: 'home' },
];
