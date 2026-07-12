import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { toAuthenticatedUser } from "@pulse/contracts/auth";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { changeLocalUserPasswordSchema } from "@pulse/contracts/local-users";
import { AuthError, AuthService } from "@/shared/auth.service";
import {
  accessRoleInclude,
  effectiveRolePermissions,
  roleSummary
} from "@/lib/services/roleAccessService";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("session")
  async session(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(request);
    return { user };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = loginSchema.parse(body);
    const user = await prisma.localUser.findUnique({
      where: { email: payload.email.toLowerCase() },
      include: { accessRole: { include: accessRoleInclude } }
    });

    if (
      !user ||
      !user.active ||
      Boolean(user.accessRole.archivedAt) ||
      user.authProvider !== "LOCAL" ||
      !verifyPassword(payload.password, user.passwordHash)
    ) {
      response.status(401);
      return { error: "Invalid email or password." };
    }

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
    this.auth.setSessionCookie(response, user.id);

    await recordActivity({
      user: authUser,
      relatedEntityType: "User",
      relatedEntityId: user.id,
      type: "Login",
      title: `${user.name} signed in`,
      detail: "Local development login succeeded."
    });

    return { user: authUser };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const user = await this.auth.getCurrentUser(request);
    this.auth.clearSessionCookie(response);

    if (user) {
      await recordActivity({
        user,
        relatedEntityType: "User",
        relatedEntityId: user.id,
        type: "Logout",
        title: `${user.name} signed out`,
        detail: "Local development session ended."
      });
    }

    return { ok: true };
  }

  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request);
    const payload = changeLocalUserPasswordSchema.parse(body);
    const localUser = await prisma.localUser.findUnique({
      where: { id: user.id }
    });

    if (!localUser || !localUser.active) {
      throw new AuthError("Authentication required.", 401);
    }

    if (localUser.authProvider !== "LOCAL") {
      throw new Error("LOCAL_USER_PASSWORD_UNAVAILABLE");
    }

    if (!verifyPassword(payload.currentPassword, localUser.passwordHash)) {
      throw new Error("LOCAL_USER_PASSWORD_INVALID");
    }

    const updatedUser = await prisma.localUser.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(payload.newPassword),
        mustChangePassword: false
      },
      include: { accessRole: { include: accessRoleInclude } }
    });
    const authUser = toAuthenticatedUser({
      ...updatedUser,
      accessRole: roleSummary(updatedUser.accessRole),
      permissions: effectiveRolePermissions(updatedUser.accessRole),
      isSystemAdmin: updatedUser.accessRole.protected && updatedUser.accessRole.systemKey === "ADMIN"
    });

    await recordActivity({
      user: authUser,
      relatedEntityType: "User",
      relatedEntityId: updatedUser.id,
      type: "Password Changed",
      title: `${updatedUser.name} changed password`,
      detail: "Local Pulse password was changed by the account owner.",
      metadata: {
        mustChangePassword: false
      }
    });

    return { user: authUser };
  }
}
