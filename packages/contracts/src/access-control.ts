import { z } from "zod";

export const permissionKeys = [
  "requests:read",
  "requests:write",
  "clients:read",
  "clients:write",
  "items:read",
  "items:write",
  "quotes:read",
  "quotes:write",
  "projects:read",
  "projects:write",
  "billing:read",
  "billing:write",
  "activity:write",
  "activity:read",
  "analytics:read",
  "audit:read",
  "settings:read",
  "settings:write",
  "users:manage",
  "roles:manage"
] as const;

export type Permission = (typeof permissionKeys)[number];

export const permissionSchema = z.enum(permissionKeys);

export type PermissionDefinition = {
  key: Permission;
  group: "work" | "collaboration" | "administration";
  resource: string;
  label: string;
  description: string;
  dependencies: Permission[];
  protected?: boolean;
};

export const permissionDefinitions: PermissionDefinition[] = [
  { key: "requests:read", group: "work", resource: "requests", label: "View", description: "Open request queues, records, and documents.", dependencies: [] },
  { key: "requests:write", group: "work", resource: "requests", label: "Manage", description: "Create, edit, archive, assign, upload, and convert requests.", dependencies: ["requests:read", "clients:read"] },
  { key: "clients:read", group: "work", resource: "clients", label: "View", description: "Open clients, contacts, and sites.", dependencies: [] },
  { key: "clients:write", group: "work", resource: "clients", label: "Manage", description: "Create, edit, archive, and bulk import client records.", dependencies: ["clients:read"] },
  { key: "items:read", group: "work", resource: "items", label: "View", description: "Browse items, prices, kits, and BOM details.", dependencies: [] },
  { key: "items:write", group: "work", resource: "items", label: "Manage", description: "Create, edit, and deactivate catalog items.", dependencies: ["items:read"] },
  { key: "quotes:read", group: "work", resource: "quotes", label: "View", description: "Open quote queues, workspaces, proposals, and documents.", dependencies: [] },
  { key: "quotes:write", group: "work", resource: "quotes", label: "Manage", description: "Create, edit, archive, and convert quotes and proposal lines.", dependencies: ["quotes:read", "clients:read", "items:read"] },
  { key: "projects:read", group: "work", resource: "projects", label: "View", description: "Open projects, project records, and documents.", dependencies: [] },
  { key: "projects:write", group: "work", resource: "projects", label: "Manage", description: "Create, edit, archive, and update projects.", dependencies: ["projects:read", "clients:read"] },
  { key: "billing:read", group: "work", resource: "billing", label: "View", description: "Open invoices and billing records.", dependencies: [] },
  { key: "billing:write", group: "work", resource: "billing", label: "Manage", description: "Create, edit, archive, and update invoices.", dependencies: ["billing:read", "projects:read", "clients:read"] },
  { key: "activity:write", group: "collaboration", resource: "collaboration", label: "Contribute updates & tasks", description: "Add updates, activities, tasks, and checklist progress to records the role can view.", dependencies: [] },
  { key: "activity:read", group: "collaboration", resource: "activity", label: "View recent changes", description: "View scoped operational changes on the dashboard and records the role can access.", dependencies: [] },
  { key: "analytics:read", group: "collaboration", resource: "analytics", label: "View analytics", description: "Open the Analytics workspace.", dependencies: [] },
  { key: "audit:read", group: "administration", resource: "audit", label: "View security audit log", description: "Review authentication, account, permission, and workspace-administration events.", dependencies: ["settings:read"], protected: true },
  { key: "settings:read", group: "administration", resource: "settings", label: "View workspace administration", description: "Open workspace settings, roadmap, and request checklist administration.", dependencies: [] },
  { key: "settings:write", group: "administration", resource: "settings", label: "Manage workspace administration", description: "Change workspace settings and request checklist templates.", dependencies: ["settings:read"] },
  { key: "users:manage", group: "administration", resource: "users", label: "Manage users", description: "Create and manage non-Administrator user accounts.", dependencies: ["settings:read"] },
  { key: "roles:manage", group: "administration", resource: "roles", label: "Manage roles & permissions", description: "Create roles and change the role permission matrix.", dependencies: ["settings:read"], protected: true }
];

const definitionByKey = new Map(permissionDefinitions.map((definition) => [definition.key, definition]));

export function normalizePermissions(input: readonly Permission[]) {
  const normalized = new Set<Permission>();

  function add(permission: Permission) {
    if (normalized.has(permission)) return;
    normalized.add(permission);
    for (const dependency of definitionByKey.get(permission)?.dependencies ?? []) add(dependency);
  }

  for (const permission of input) add(permission);
  return permissionKeys.filter((permission) => normalized.has(permission));
}

export const assignablePermissionKeys = permissionKeys.filter(
  (permission) => !definitionByKey.get(permission)?.protected
);

export const roleColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a six-digit hex color.")
  .transform((value) => value.toUpperCase());

export type RoleSummary = {
  id: string;
  name: string;
  color: string;
};

export type AccessRoleRecord = RoleSummary & {
  permissions: Permission[];
  protected: boolean;
  archived: boolean;
  assignedUserCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AccessControlRecord = {
  roles: AccessRoleRecord[];
};

export const roleNameSchema = z.string().trim().min(2, "Role name must be at least 2 characters.").max(50);

export const createAccessRoleSchema = z.object({
  name: roleNameSchema,
  color: roleColorSchema,
  copyFromRoleId: z.string().trim().min(1).nullable().optional()
});

export const saveAccessRoleMatrixSchema = z.object({
  roles: z.array(z.object({
    id: z.string().trim().min(1),
    version: z.number().int().positive(),
    name: roleNameSchema,
    color: roleColorSchema,
    permissions: z.array(permissionSchema).max(permissionKeys.length)
  })).min(1)
});

export const archiveAccessRoleSchema = z.object({
  version: z.number().int().positive(),
  replacementRoleId: z.string().trim().min(1).nullable().optional()
});

export const restoreAccessRoleSchema = z.object({
  version: z.number().int().positive()
});

export type CreateAccessRoleInput = z.infer<typeof createAccessRoleSchema>;
export type SaveAccessRoleMatrixInput = z.infer<typeof saveAccessRoleMatrixSchema>;
export type ArchiveAccessRoleInput = z.infer<typeof archiveAccessRoleSchema>;
export type RestoreAccessRoleInput = z.infer<typeof restoreAccessRoleSchema>;

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function roleColorForeground(color: string) {
  const parsed = roleColorSchema.safeParse(color);
  if (!parsed.success) return "#FFFFFF";
  const luminance = relativeLuminance(parsed.data);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}
