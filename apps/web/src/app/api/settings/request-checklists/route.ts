import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  createRequestChecklistTemplate,
  listRequestChecklistTemplates
} from "@/lib/services/requestChecklistTemplateService";
import { createRequestChecklistTemplateSchema } from "@/lib/validations/requestChecklistTemplate";

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

export async function POST(request: Request) {
  try {
    const user = await requireUser("settings:write");
    const payload = createRequestChecklistTemplateSchema.parse(await request.json());
    return NextResponse.json({
      template: await createRequestChecklistTemplate(payload, user)
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
