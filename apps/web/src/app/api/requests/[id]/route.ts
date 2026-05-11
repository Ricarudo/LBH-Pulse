import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  archiveRequest,
  getRequestById,
  updateRequest
} from "@/lib/services/requestService";
import { updateRequestSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser("crm:read");
    const { id } = await params;
    const requestRecord = await getRequestById(id);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const payload = updateRequestSchema.parse(await request.json());
    const requestRecord = await updateRequest(id, payload, user);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const requestRecord = await archiveRequest(id, user);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}
