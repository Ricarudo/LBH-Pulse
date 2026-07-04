import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings
} from "@/lib/services/settingsService";
import { workspaceSettingsSchema } from "@/lib/validations/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ workspace: await getWorkspaceSettings() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser("settings:write");
    const payload = workspaceSettingsSchema.parse(await request.json());
    return NextResponse.json({
      workspace: await updateWorkspaceSettings(payload, user)
    });
  } catch (error) {
    return apiError(error);
  }
}
