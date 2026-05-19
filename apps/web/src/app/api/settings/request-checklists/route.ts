import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { listRequestChecklistTemplates } from "@/lib/services/requestChecklistTemplateService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser("settings:read");
    const templates = await listRequestChecklistTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    return apiError(error);
  }
}
