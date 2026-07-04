import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  getUserPreferences,
  updateUserPreferences
} from "@/lib/services/settingsService";
import { userPreferencesSchema } from "@/lib/validations/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ preferences: await getUserPreferences(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const payload = userPreferencesSchema.parse(await request.json());
    return NextResponse.json({
      preferences: await updateUserPreferences(user.id, payload)
    });
  } catch (error) {
    return apiError(error);
  }
}
