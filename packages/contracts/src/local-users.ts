import type { AuthProvider, LocalRole } from "./auth";

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

import { z } from "zod";

export const localRoleSchema = z.enum(["Admin", "Sales", "ProjectManager", "Technician"]);

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const localPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.");

export const createLocalUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: emailSchema,
  role: localRoleSchema,
  password: localPasswordSchema,
  active: z.boolean().default(true)
});

export const updateLocalUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").optional(),
  email: emailSchema.optional(),
  role: localRoleSchema.optional(),
  active: z.boolean().optional()
});

export const resetLocalUserPasswordSchema = z.object({
  temporaryPassword: localPasswordSchema
});

export const changeLocalUserPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: localPasswordSchema
});

export type CreateLocalUserInput = z.infer<typeof createLocalUserSchema>;
export type UpdateLocalUserInput = z.infer<typeof updateLocalUserSchema>;
export type ResetLocalUserPasswordInput = z.infer<typeof resetLocalUserPasswordSchema>;
export type ChangeLocalUserPasswordInput = z.infer<typeof changeLocalUserPasswordSchema>;
