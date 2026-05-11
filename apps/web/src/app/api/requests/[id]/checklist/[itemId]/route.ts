import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { updateRequestChecklistItem } from "@/lib/services/requestService";
import { updateRequestChecklistItemSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:activity:write");
    const { id, itemId } = await params;
    const payload = updateRequestChecklistItemSchema.parse(await request.json());
    const requestRecord = await updateRequestChecklistItem(id, itemId, payload, user);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}
