import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  email = '';
  password = '';
  displayName = '';
  errorMessage = signal<string | null>(null);
  isSubmitting = signal(false);
  showPassword = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  submit(): void {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService
      .register({ email: this.email, password: this.password, displayName: this.displayName })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          // See login.ts's returnUrl handling for why — same "came from a
          // /join/:code link" case applies here.
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          this.router.navigateByUrl(returnUrl ?? '/home');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err.error?.message ?? 'Registration failed. Please try again.');
        },
      });
  }
}
