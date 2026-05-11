import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth/session";
import { recordActivity } from "@/lib/services/activityService";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

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

    return response;
  } catch (error) {
    return apiError(error);
  }
}
