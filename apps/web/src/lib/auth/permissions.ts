export type LocalRole = "Admin" | "Sales" | "ProjectManager" | "Technician";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  roleLabel: string;
};

export type Permission =
  | "crm:read"
  | "crm:write"
  | "crm:activity:write"
  | "activity:read"
  | "settings:read"
  | "settings:write"
  | "users:manage";

export const roleLabels: Record<LocalRole, string> = {
  Admin: "Administrator",
  Sales: "Sales",
  ProjectManager: "Project Manager",
  Technician: "Technician"
};

export const rolePermissions: Record<LocalRole, Permission[]> = {
  Admin: [
    "crm:read",
    "crm:write",
    "crm:activity:write",
    "activity:read",
    "settings:read",
    "settings:write",
    "users:manage"
  ],
  Sales: ["crm:read", "crm:write", "crm:activity:write", "activity:read"],
  ProjectManager: ["crm:read", "crm:activity:write", "activity:read"],
  Technician: ["crm:read", "activity:read"]
};

export function isLocalRole(role: string): role is LocalRole {
  return role === "Admin" || role === "Sales" || role === "ProjectManager" || role === "Technician";
}

export function canRole(role: LocalRole | undefined, permission: Permission) {
  return role ? rolePermissions[role].includes(permission) : false;
}

export function toAuthenticatedUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}): AuthenticatedUser {
  const role = isLocalRole(user.role) ? user.role : "Technician";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    roleLabel: roleLabels[role]
  };
}

export function canSeeActivity(
  user: AuthenticatedUser,
  activity: { actorUserId?: string | null; actorRole: string; relatedEntityType: string }
) {
  if (user.role === "Admin" || user.role === "Sales" || user.role === "ProjectManager") {
    return true;
  }

  return activity.actorUserId === user.id || activity.actorRole === user.role;
}
