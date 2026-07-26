import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { toAuthenticatedUser } from "@pulse/contracts/auth";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { changeLocalUserPasswordSchema } from "@pulse/contracts/local-users";
import { AuthError, AuthService } from "@/shared/auth.service";
import { AuthProtectionService } from "@/shared/auth-protection.service";
import { FirstRunSetupService } from "@/shared/first-run-setup.service";
import { runtimeEnvironment } from "@/config/runtimeEnvironment";
import {
  accessRoleInclude,
  effectiveRolePermissions,
  roleSummary
} from "@/lib/services/roleAccessService";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(1_024)
});

const genericLoginError = "Unable to sign in.";
const genericSetupError = "Setup could not be completed.";

const firstRunSetupSchema = z.object({
  setupToken: z.string().min(1).max(1_024),
  name: z.string().trim().min(2, "Enter the Administrator's name.").max(100),
  email: z.string().trim().email("Enter a valid Administrator email.").transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(20, "The Administrator password must contain at least 20 characters.")
    .max(256)
}).superRefine((value, context) => {
  if (!/[A-Z]/.test(value.password) || !/[a-z]/.test(value.password) || !/[0-9]/.test(value.password)) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "Use upper-case, lower-case, and numeric characters."
    });
  }
  const password = value.password.toLowerCase();
  const emailIdentifier = value.email.split("@", 1)[0];
  if (password.includes(value.name.toLowerCase()) || (emailIdentifier.length >= 3 && password.includes(emailIdentifier))) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "The password must not contain the Administrator name or email identifier."
    });
  }
});

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthProtectionService) private readonly protection: AuthProtectionService,
    @Inject(FirstRunSetupService) private readonly firstRunSetup: FirstRunSetupService
  ) {}

  @Get("session")
  async session(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(request);
    return {
      user,
      csrfToken: user ? await this.auth.getCsrfToken(request) : null,
      setupRequired: user ? false : (await this.firstRunSetup.status()).setupRequired
    };
  }

  @Post("setup")
  @HttpCode(200)
  async setup(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = firstRunSetupSchema.parse(body);
    const status = await this.firstRunSetup.status();
    if (!status.setupRequired) throw new Error("INITIAL_SETUP_NOT_AVAILABLE");

    const remoteAddress = request.ip || request.socket.remoteAddress || "unknown";
    const keys = this.protection.keys(`first-run:${payload.setupToken}`, remoteAddress);
    if (await this.protection.isBlocked(keys)) {
      await this.protection.recordSecurityEvent("INITIAL_SETUP_BLOCKED", keys, { blocked: true });
      response.status(429);
      return { error: genericSetupError };
    }
    if (!this.firstRunSetup.tokenMatches(payload.setupToken)) {
      const blocked = await this.protection.recordFailure(keys);
      response.status(blocked ? 429 : 403);
      return { error: genericSetupError };
    }

    const user = await this.firstRunSetup.createAdministrator({
      name: payload.name,
      email: payload.email,
      password: payload.password
    });
    await this.protection.recordSuccess(keys);
    const csrfToken = await this.auth.issueSession(request, response, user.id);
    await this.protection.recordSecurityEvent("INITIAL_SETUP_COMPLETED", keys, {
      userIdRecorded: true
    });
    return { user, csrfToken, setupRequired: false };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = loginSchema.parse(body);
    const normalizedEmail = payload.email.toLowerCase();
    const keys = this.protection.keys(normalizedEmail, request.ip || request.socket.remoteAddress || "unknown");

    if (await this.protection.isBlocked(keys)) {
      await this.protection.recordSecurityEvent("LOGIN_BLOCKED", keys, { blocked: true });
      response.status(429);
      return { error: genericLoginError };
    }

    const user = await prisma.localUser.findUnique({
      where: { email: normalizedEmail },
      include: { accessRole: { include: accessRoleInclude } }
    });
    const passwordValid = this.protection.passwordMatches(payload.password, user?.passwordHash);
    const accountValid = Boolean(
      user &&
      user.active &&
      (!user.isDemoAccount || runtimeEnvironment().nodeEnv !== "production") &&
      !user.accessRole.archivedAt &&
      user.authProvider === "LOCAL" &&
      passwordValid
    );

    if (!accountValid || !user) {
      const blocked = await this.protection.recordFailure(keys);
      response.status(blocked ? 429 : 401);
      return { error: genericLoginError };
    }

    await this.protection.recordSuccess(keys);
    const updatedUser = await prisma.localUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      include: { accessRole: { include: accessRoleInclude } }
    });
    const authUser = toAuthenticatedUser({
      ...updatedUser,
      accessRole: roleSummary(updatedUser.accessRole),
      permissions: effectiveRolePermissions(updatedUser.accessRole),
      isSystemAdmin: updatedUser.accessRole.protected && updatedUser.accessRole.systemKey === "ADMIN"
    });
    const csrfToken = await this.auth.issueSession(request, response, user.id);

    await recordActivity({
      user: authUser,
      relatedEntityType: "User",
      relatedEntityId: user.id,
      type: "Login",
      title: `${user.name} signed in`,
      detail: "Pulse authentication succeeded."
    });

    return { user: authUser, csrfToken };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const user = await this.auth.getCurrentUser(request);
    await this.auth.logout(request, response);

    if (user) {
      await recordActivity({
        user,
        relatedEntityType: "User",
        relatedEntityId: user.id,
        type: "Logout",
        title: `${user.name} signed out`,
        detail: "The active Pulse session was revoked."
      });
    }
    return { ok: true };
  }

  @Post("change-password")
  @HttpCode(200)
  async changePassword(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const user = await this.auth.requireUser(request);
    const payload = changeLocalUserPasswordSchema.parse(body);
    const localUser = await prisma.localUser.findUnique({ where: { id: user.id } });

    if (!localUser || !localUser.active) throw new AuthError("Authentication required.", 401);
    if (localUser.authProvider !== "LOCAL") throw new Error("LOCAL_USER_PASSWORD_UNAVAILABLE");
    if (!verifyPassword(payload.currentPassword, localUser.passwordHash)) {
      throw new Error("LOCAL_USER_PASSWORD_INVALID");
    }

    const updatedUser = await prisma.localUser.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(payload.newPassword),
        mustChangePassword: false,
        isDemoAccount: false
      },
      include: { accessRole: { include: accessRoleInclude } }
    });
    const authUser = toAuthenticatedUser({
      ...updatedUser,
      accessRole: roleSummary(updatedUser.accessRole),
      permissions: effectiveRolePermissions(updatedUser.accessRole),
      isSystemAdmin: updatedUser.accessRole.protected && updatedUser.accessRole.systemKey === "ADMIN"
    });

    await this.auth.revokeAllUserSessions(user.id);
    const csrfToken = await this.auth.issueSession(request, response, user.id);
    await recordActivity({
      user: authUser,
      relatedEntityType: "User",
      relatedEntityId: updatedUser.id,
      type: "Password Changed",
      title: `${updatedUser.name} changed password`,
      detail: "The local Pulse password was changed and all prior sessions were revoked.",
      metadata: { mustChangePassword: false, sessionsRevoked: true }
    });

    return { user: authUser, csrfToken };
  }
}
