import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService, LocalUser } from './_services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Kuote Suite';
  isIframe = false;
  loginDisplay = false;
  localUsers: LocalUser[] = [];
  currentUser: LocalUser | null = null;
  selectedUserId = 'local-admin';

  private readonly _destroying$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.isIframe = window !== window.parent && !window.opener;
    this.localUsers = this.authService.getLocalUsers();

    const existingUser = this.authService.getCurrentUser();
    if (existingUser) {
      this.selectedUserId = existingUser.id;
    }

    this.authService.currentUser$
      .pipe(takeUntil(this._destroying$))
      .subscribe((user) => {
        this.currentUser = user;
        this.loginDisplay = Boolean(user);
      });
  }

  login(): void {
    const user = this.authService.login(this.selectedUserId);
    this.selectedUserId = user.id;
    this.router.navigate(['/lDashboard']);
  }

  redirectToLeads(): void {
    this.router.navigate(['/lDashboard']);
  }

  redirectToQuotes(): void {
    this.router.navigate(['/qDashboard']);
  }

  redirectToStatistics(): void {
    this.router.navigate(['/statistics']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  getPicture(): void {
    // Future profile providers can hook in here if Azure/Entra login is restored.
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
