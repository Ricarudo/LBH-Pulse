import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { restoreRequestChecklistTemplate } from "@/lib/services/requestChecklistTemplateService";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("settings:write");
    const { templateId } = await params;
    return NextResponse.json({
      template: await restoreRequestChecklistTemplate(templateId, user)
    });
  } catch (error) {
    return apiError(error);
  }
}
