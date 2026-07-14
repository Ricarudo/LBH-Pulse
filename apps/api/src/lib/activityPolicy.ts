import type { AuditEventCategory } from "@pulse/contracts/audit";

export const securityAuditEntityTypes = [
  "User",
  "AccessRole",
  "WorkspaceSettings",
  "AuditLog"
] as const;

export const authenticationAuditTypes = [
  "Login",
  "Logout",
  "Password Changed",
  "Password Reset",
  "Permission Denied"
] as const;

export const defaultAuditRetentionDays = 365;
export const defaultOperationalRetentionDays = 730;

const securityEntityTypeSet = new Set<string>(securityAuditEntityTypes);
const authenticationTypeSet = new Set<string>(authenticationAuditTypes);

function retentionDays(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 30 || parsed > 3_650) return fallback;
  return parsed;
}

export function activityRetentionPolicy(
  environment: NodeJS.ProcessEnv = process.env
) {
  return {
    auditRetentionDays: retentionDays(
      environment.PULSE_AUDIT_RETENTION_DAYS,
      defaultAuditRetentionDays
    ),
    operationalRetentionDays: retentionDays(
      environment.PULSE_OPERATIONAL_RETENTION_DAYS,
      defaultOperationalRetentionDays
    )
  };
}

export function isSecurityAuditEntity(relatedEntityType: string) {
  return securityEntityTypeSet.has(relatedEntityType);
}

export function auditCategoryFor(
  relatedEntityType: string,
  type: string
): Exclude<AuditEventCategory, "all"> {
  if (relatedEntityType === "User" && authenticationTypeSet.has(type)) {
    return "authentication";
  }
  if (relatedEntityType === "AccessRole" || type === "Role Changed") {
    return "permissions";
  }
  if (relatedEntityType === "User") return "accounts";
  return "administration";
}
