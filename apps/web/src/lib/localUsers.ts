export type LocalRole = "Admin" | "Sales" | "ProjectManager" | "Technician";

export type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  roleLabel: string;
};

export const localUsers: LocalUser[] = [
  {
    id: "local-admin",
    name: "Admin User",
    email: "admin@r2.local",
    role: "Admin",
    roleLabel: "Administrator"
  },
  {
    id: "local-sales",
    name: "Sales User",
    email: "sales@r2.local",
    role: "Sales",
    roleLabel: "Sales"
  },
  {
    id: "local-project-manager",
    name: "Project Manager User",
    email: "project.manager@r2.local",
    role: "ProjectManager",
    roleLabel: "Project Manager"
  },
  {
    id: "local-technician",
    name: "Technician User",
    email: "technician@r2.local",
    role: "Technician",
    roleLabel: "Technician"
  }
];

export function findLocalUser(userId: string | null): LocalUser | null {
  if (!userId) {
    return null;
  }

  return localUsers.find((user) => user.id === userId) ?? null;
}

