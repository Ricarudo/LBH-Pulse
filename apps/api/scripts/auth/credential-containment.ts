import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

const apply = process.argv.includes("--apply");
const accountSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  currentPassword: z.string().min(1),
  action: z.enum(["rotate", "disable"]),
  replacementPassword: z.string().min(20).optional()
}).superRefine((account, context) => {
  if (account.action === "rotate" && !account.replacementPassword) {
    context.addIssue({ code: "custom", path: ["replacementPassword"], message: "Replacement password is required for rotation." });
  }
  if (account.replacementPassword === account.currentPassword) {
    context.addIssue({ code: "custom", path: ["replacementPassword"], message: "Replacement password must differ from the compromised password." });
  }
});
const fileSchema = z.object({ accounts: z.array(accountSchema).min(1).max(25) });

function loadInput() {
  const file = process.env.PULSE_CREDENTIAL_CONTAINMENT_FILE;
  if (!file) throw new Error("PULSE_CREDENTIAL_CONTAINMENT_FILE is required.");
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o022) !== 0) throw new Error("Credential containment file must not be group- or world-writable.");
  return fileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

async function main() {
  const input = loadInput();
  const normalized = input.accounts
    .map(({ email, action }) => ({ email, action }))
    .sort((left, right) => left.email.localeCompare(right.email));
  if (new Set(normalized.map(({ email }) => email)).size !== normalized.length) {
    throw new Error("Credential containment input contains duplicate accounts.");
  }
  const digest = createHash("sha256")
    .update(`CREDENTIAL_CONTAINMENT\0${JSON.stringify(normalized)}`)
    .digest("hex");
  const completed = await prisma.maintenanceRun.findFirst({
    where: { kind: "CREDENTIAL_CONTAINMENT", mode: "APPLY", reportDigest: digest, completedAt: { not: null } },
    select: { id: true, completedAt: true }
  });
  if (completed) {
    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "PREVIEW",
      status: "already-applied",
      maintenanceRunId: completed.id,
      completedAt: completed.completedAt?.toISOString()
    }, null, 2));
    return;
  }

  const users = await prisma.localUser.findMany({
    where: { email: { in: normalized.map(({ email }) => email) } },
    select: { id: true, email: true, passwordHash: true, active: true, role: true, mustChangePassword: true }
  });
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const findings = input.accounts.map((account) => {
    const user = usersByEmail.get(account.email);
    const passwordMatches = Boolean(user && verifyPassword(account.currentPassword, user.passwordHash));
    return {
      entityType: "LocalUser",
      entityId: user?.id ?? null,
      email: account.email,
      current: user ? { active: user.active, role: user.role, mustChangePassword: user.mustChangePassword } : null,
      shippedCredentialMatches: passwordMatches,
      proposedRepair: account.action === "disable"
        ? "Deactivate account, require reset, and revoke sessions"
        : "Rotate from the secret file, require reset, and revoke sessions",
      reason: "Credential is included in the verified shipped-credential set.",
      confidence: passwordMatches ? "high" : "none",
      automaticRepairSafe: passwordMatches,
      humanReviewRequired: !passwordMatches
    };
  });
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW", reportDigest: digest, findings }, null, 2));
  if (!apply) return;
  if (findings.some((finding) => !finding.shippedCredentialMatches)) {
    throw new Error("Containment was not applied because at least one account was absent or no longer matched the supplied compromised credential.");
  }

  await prisma.$transaction(async (transaction) => {
    const run = await transaction.maintenanceRun.create({
      data: {
        kind: "CREDENTIAL_CONTAINMENT",
        mode: "APPLY",
        reportDigest: digest,
        actorEmailSnapshot: process.env.PULSE_MAINTENANCE_ACTOR_EMAIL || null,
        summary: { accounts: normalized, sessionsRevoked: true, credentialsLogged: false }
      }
    });
    for (const account of input.accounts) {
      const user = usersByEmail.get(account.email)!;
      await transaction.localUser.update({
        where: { id: user.id },
        data: account.action === "disable"
          ? { active: false, deactivatedAt: new Date(), mustChangePassword: true, isDemoAccount: false }
          : {
              passwordHash: hashPassword(account.replacementPassword!),
              active: true,
              deactivatedAt: null,
              mustChangePassword: true,
              isDemoAccount: false
            }
      });
      await transaction.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await transaction.activity.create({
        data: {
          relatedEntityType: "Authentication",
          relatedEntityId: user.id,
          actorName: "Pulse Maintenance",
          actorRole: "System",
          type: "Credential Containment",
          title: "Compromised credential contained",
          detail: "The account credential was contained and all active sessions were revoked.",
          metadata: { maintenanceRunId: run.id, userId: user.id, action: account.action, mustChangePassword: true }
        }
      });
    }
    await transaction.maintenanceRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
  });
  console.log("Credential containment applied. No credential value was logged.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Credential containment failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
