import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { updateRequestChecklistTemplate } from "@/lib/services/requestChecklistTemplateService";
import { updateRequestChecklistTemplateSchema } from "@/lib/validations/requestChecklistTemplate";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("settings:write");
    const { templateId } = await params;
    const payload = updateRequestChecklistTemplateSchema.parse(await request.json());
    const template = await updateRequestChecklistTemplate(templateId, payload, user);
    return NextResponse.json({ template });
  } catch (error) {
    return apiError(error);
  }
}
