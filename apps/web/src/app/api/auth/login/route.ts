import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { toAuthenticatedUser } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/services/activityService";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const user = await prisma.localUser.findUnique({
      where: { email: payload.email.toLowerCase() }
    });

    if (
      !user ||
      !user.active ||
      user.authProvider !== "LOCAL" ||
      !verifyPassword(payload.password, user.passwordHash)
    ) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const updatedUser = await prisma.localUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    const authUser = toAuthenticatedUser(updatedUser);
    const response = NextResponse.json({ user: authUser });
    setSessionCookie(response, user.id);

    await recordActivity({
      user: authUser,
      relatedEntityType: "User",
      relatedEntityId: user.id,
      type: "Login",
      title: `${user.name} signed in`,
      detail: "Local development login succeeded."
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
