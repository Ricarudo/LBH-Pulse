import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { permissionKeys } from "@pulse/contracts/access-control";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

const apply = process.argv.includes("--apply");
const rotateExisting = process.argv.includes("--rotate-existing");

const inputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  passwordFile: z.string().trim().min(1)
});

function readPassword(file: string) {
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o022) !== 0) {
    throw new Error("Bootstrap password file must not be group- or world-writable.");
  }
  const password = readFileSync(file, "utf8").replace(/[\r\n]+$/, "");
  if (password.includes("\n") || password.includes("\r") || password.length < 20) {
    throw new Error("Bootstrap password file must contain one password of at least 20 characters.");
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Bootstrap password must contain upper-case, lower-case, and numeric characters.");
  }
  return password;
}

async function main() {
  const input = inputSchema.parse({
    name: process.env.PULSE_BOOTSTRAP_ADMIN_NAME,
    email: process.env.PULSE_BOOTSTRAP_ADMIN_EMAIL,
    passwordFile: process.env.PULSE_BOOTSTRAP_ADMIN_PASSWORD_FILE
  });
  const rotationId = process.env.PULSE_ADMIN_ROTATION_ID?.trim();
  if (rotateExisting && (!rotationId || !/^[A-Za-z0-9._-]{6,100}$/.test(rotationId))) {
    throw new Error("PULSE_ADMIN_ROTATION_ID is required for an idempotent administrator rotation.");
  }
  const maintenanceKind = rotateExisting ? "ADMIN_CREDENTIAL_ROTATION" : "SECURE_ADMIN_BOOTSTRAP";
  const digest = createHash("sha256")
    .update(`${maintenanceKind}\0${input.email}\0${rotationId ?? "initial"}`)
    .digest("hex");
  const completed = await prisma.maintenanceRun.findFirst({
    where: { kind: maintenanceKind, mode: "APPLY", reportDigest: digest, completedAt: { not: null } },
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

  const password = readPassword(input.passwordFile);
  if (password.toLowerCase().includes(input.email.split("@", 1)[0]) || password.toLowerCase().includes(input.name.toLowerCase())) {
    throw new Error("Bootstrap password must not contain the administrator name or email identifier.");
  }
  const existing = await prisma.localUser.findUnique({
    where: { email: input.email },
    select: { id: true, active: true, role: true, mustChangePassword: true, isDemoAccount: true }
  });
  if (existing && !rotateExisting) {
    throw new Error("Administrator email already exists. Review it, then rerun with --rotate-existing to rotate it explicitly.");
  }
  if (!existing && rotateExisting) {
    throw new Error("Administrator rotation requires an existing account; run the one-time bootstrap first.");
  }

  const report = {
    mode: apply ? "APPLY" : "PREVIEW",
    administrator: {
      id: existing?.id ?? null,
      email: input.email,
      current: existing ?? null,
      proposed: {
        active: true,
        role: "Admin",
        mustChangePassword: true,
        isDemoAccount: false,
        password: existing ? "rotate-from-secret-file" : "set-from-secret-file"
      }
    },
    automaticRepairSafe: true,
    confidence: "high",
    humanReviewRequired: Boolean(existing),
    reportDigest: digest
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  await prisma.$transaction(async (transaction) => {
    await transaction.accessRole.upsert({
      where: { id: "Admin" },
      create: {
        id: "Admin",
        name: "Administrator",
        normalizedName: "administrator",
        color: "#7C3AED",
        systemKey: "ADMIN",
        protected: true,
        permissions: { create: permissionKeys.map((permission) => ({ permission })) }
      },
      update: {
        name: "Administrator",
        normalizedName: "administrator",
        systemKey: "ADMIN",
        protected: true,
        archivedAt: null
      }
    });
    for (const permission of permissionKeys) {
      await transaction.rolePermission.upsert({
        where: { roleId_permission: { roleId: "Admin", permission } },
        create: { roleId: "Admin", permission },
        update: {}
      });
    }

    const user = existing
      ? await transaction.localUser.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            role: "Admin",
            passwordHash: hashPassword(password),
            active: true,
            deactivatedAt: null,
            mustChangePassword: true,
            isDemoAccount: false,
            authProvider: "LOCAL"
          }
        })
      : await transaction.localUser.create({
          data: {
            name: input.name,
            email: input.email,
            role: "Admin",
            passwordHash: hashPassword(password),
            active: true,
            mustChangePassword: true,
            isDemoAccount: false,
            authProvider: "LOCAL"
          }
        });
    await transaction.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const run = await transaction.maintenanceRun.create({
      data: {
        kind: maintenanceKind,
        mode: "APPLY",
        reportDigest: digest,
        actorEmailSnapshot: process.env.PULSE_MAINTENANCE_ACTOR_EMAIL || input.email,
        summary: {
          userId: user.id,
          email: input.email,
          created: !existing,
          rotated: Boolean(existing),
          rotationId: rotationId ?? null,
          mustChangePassword: true
        },
        completedAt: new Date()
      }
    });
    await transaction.activity.create({
      data: {
        relatedEntityType: "Authentication",
        relatedEntityId: user.id,
        actorName: "Pulse Maintenance",
        actorRole: "System",
        type: "Administrator Bootstrap",
        title: "Administrator credentials provisioned",
        detail: "A controlled administrator bootstrap completed and existing sessions were revoked.",
        metadata: { maintenanceRunId: run.id, userId: user.id, created: !existing, rotated: Boolean(existing) }
      }
    });
  });
  console.log("Administrator bootstrap applied. No credential value was logged.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
