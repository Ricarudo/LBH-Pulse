import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  UrlTree
} from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuardService implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const expectedRoles = route.data.expectedRole as string[] | undefined;

    if (!this.authService.isAuthenticated()) {
      return this.router.createUrlTree(['/']);
    }

    if (this.authService.hasRole(expectedRoles)) {
      return true;
    }

    window.alert('Your local development user does not have access to this page.');
    return this.router.createUrlTree(['/']);
  }
}
