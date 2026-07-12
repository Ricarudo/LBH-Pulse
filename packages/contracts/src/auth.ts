import type { Permission, RoleSummary } from "./access-control";
export type { Permission } from "./access-control";

export type LocalRole = "Admin" | "Sales" | "ProjectManager" | "Technician";
export type AuthProvider = "LOCAL" | "ENTRA";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  accessRole: RoleSummary;
  permissions: Permission[];
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  authProvider: AuthProvider;
};

export const roleLabels: Record<LocalRole, string> = {
  Admin: "Administrator",
  Sales: "Sales",
  ProjectManager: "Project Manager",
  Technician: "Technician"
};

export const rolePermissions: Record<LocalRole, Permission[]> = {
  Admin: [
    "requests:read", "requests:write",
    "clients:read", "clients:write",
    "items:read", "items:write",
    "quotes:read", "quotes:write",
    "projects:read", "projects:write",
    "billing:read", "billing:write",
    "activity:write",
    "activity:read",
    "analytics:read",
    "settings:read",
    "settings:write",
    "users:manage",
    "roles:manage"
  ],
  Sales: [
    "requests:read", "requests:write", "clients:read", "clients:write",
    "items:read", "items:write", "quotes:read", "quotes:write",
    "projects:read", "projects:write", "billing:read", "billing:write",
    "activity:write", "activity:read", "analytics:read"
  ],
  ProjectManager: [
    "requests:read", "clients:read", "items:read", "quotes:read",
    "projects:read", "billing:read", "activity:write", "activity:read", "analytics:read"
  ],
  Technician: [
    "requests:read", "clients:read", "items:read", "quotes:read",
    "projects:read", "billing:read", "activity:read", "analytics:read"
  ]
};

export function isLocalRole(role: string): role is LocalRole {
  return role === "Admin" || role === "Sales" || role === "ProjectManager" || role === "Technician";
}
export function isAuthProvider(provider: string): provider is AuthProvider {
  return provider === "LOCAL" || provider === "ENTRA";
}

export function canRole(role: string | undefined, permission: Permission) {
  return role && isLocalRole(role) ? rolePermissions[role].includes(permission) : false;
}

export function canUser(user: { permissions: readonly Permission[] } | null | undefined, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

export function toAuthenticatedUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  accessRole?: RoleSummary;
  permissions?: Permission[];
  isSystemAdmin?: boolean;
  mustChangePassword?: boolean;
  authProvider?: string;
}): AuthenticatedUser {
  const legacyRole = isLocalRole(user.role) ? user.role : null;
  const accessRole = user.accessRole ?? {
    id: user.role,
    name: legacyRole ? roleLabels[legacyRole] : user.role,
    color: "#64748B"
  };
  const authProvider =
    user.authProvider && isAuthProvider(user.authProvider) ? user.authProvider : "LOCAL";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: accessRole.id,
    roleLabel: accessRole.name,
    accessRole,
    permissions: user.permissions ?? (legacyRole ? rolePermissions[legacyRole] : []),
    isSystemAdmin: user.isSystemAdmin ?? accessRole.id === "Admin",
    mustChangePassword: Boolean(user.mustChangePassword),
    authProvider
  };
}
