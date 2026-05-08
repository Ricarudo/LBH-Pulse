import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LocalRole, roles } from '../auth-config';
import { User } from '../_models/user';

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  roleLabel: string;
}

const LOCAL_USERS: LocalUser[] = [
  {
    id: 'local-admin',
    name: 'Admin User',
    email: 'admin@r2.local',
    role: roles.Admin,
    roleLabel: 'Administrator'
  },
  {
    id: 'local-sales',
    name: 'Sales User',
    email: 'sales@r2.local',
    role: roles.Sales,
    roleLabel: 'Sales'
  },
  {
    id: 'local-project-manager',
    name: 'Project Manager User',
    email: 'project.manager@r2.local',
    role: roles.ProjectManager,
    roleLabel: 'Project Manager'
  },
  {
    id: 'local-technician',
    name: 'Technician User',
    email: 'technician@r2.local',
    role: roles.Technician,
    roleLabel: 'Technician'
  }
];

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly storageKey = 'kuotesuite.localUserId';
  private readonly currentUserSubject = new BehaviorSubject<LocalUser | null>(this.loadCurrentUser());

  currentUser$: Observable<LocalUser | null> = this.currentUserSubject.asObservable();

  getLocalUsers(): LocalUser[] {
    return LOCAL_USERS.map((user) => ({ ...user }));
  }

  getLocalApiUsers(): User[] {
    return LOCAL_USERS.map((user) => this.toApiUser(user));
  }

  getLocalUserById(userId: string): LocalUser | null {
    return LOCAL_USERS.find((user) => user.id === userId) || null;
  }

  login(userId: string): LocalUser {
    const user = this.getLocalUserById(userId) || LOCAL_USERS[0];

    localStorage.setItem(this.storageKey, user.id);
    this.currentUserSubject.next(user);

    return user;
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.currentUserSubject.next(null);
  }

  isAuthenticated(): boolean {
    return Boolean(this.currentUserSubject.value);
  }

  getCurrentUser(): LocalUser | null {
    return this.currentUserSubject.value;
  }

  hasRole(expectedRoles: string | string[] | undefined): boolean {
    const user = this.getCurrentUser();

    if (!user) {
      return false;
    }

    if (!expectedRoles || expectedRoles.length === 0) {
      return true;
    }

    const roleList = Array.isArray(expectedRoles) ? expectedRoles : [expectedRoles];
    return roleList.includes(user.role);
  }

  getCurrentUserClaims(): any | null {
    const user = this.getCurrentUser();

    if (!user) {
      return null;
    }

    return {
      oid: user.id,
      name: user.name,
      preferred_username: user.email,
      roles: [user.role],
      role: user.role
    };
  }

  private loadCurrentUser(): LocalUser | null {
    const userId = localStorage.getItem(this.storageKey);
    return userId ? this.getLocalUserById(userId) : null;
  }

  private toApiUser(user: LocalUser): User {
    return {
      user_id: user.id,
      name: user.name,
      email: user.email
    };
  }
}
