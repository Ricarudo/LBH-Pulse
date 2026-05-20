import type { AuthProvider, LocalRole } from "@/lib/auth/permissions";

export type LocalAccountRecord = {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  roleLabel: string;
  active: boolean;
  mustChangePassword: boolean;
  authProvider: AuthProvider;
  entraObjectId: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  deactivatedAt: string;
};
