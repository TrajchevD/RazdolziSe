import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Login } from './auth/login';
import { Register } from './auth/register';
import { TripList } from './trips/trip-list';
import { TripDetail } from './trips/trip-detail';

export const routes: Routes = [
  { path: '', redirectTo: 'trips', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'trips', component: TripList, canActivate: [authGuard] },
  { path: 'trips/:id', component: TripDetail, canActivate: [authGuard] },
  { path: '**', redirectTo: 'trips' },
];
