import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { changeRequestStatus } from "@/lib/services/requestService";
import { changeRequestStatusSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const payload = changeRequestStatusSchema.parse(await request.json());
    const requestRecord = await changeRequestStatus(id, payload.status, user);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}
