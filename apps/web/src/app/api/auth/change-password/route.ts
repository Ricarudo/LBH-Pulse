import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { toAuthenticatedUser } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { changeLocalUserPasswordSchema } from "@/lib/validations/localUser";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = changeLocalUserPasswordSchema.parse(await request.json());
    const localUser = await prisma.localUser.findUnique({
      where: { id: user.id }
    });

    if (!localUser || !localUser.active) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
      }
    });
    const authUser = toAuthenticatedUser(updatedUser);

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

    return NextResponse.json({ user: authUser });
  } catch (error) {
    return apiError(error);
  }
}
