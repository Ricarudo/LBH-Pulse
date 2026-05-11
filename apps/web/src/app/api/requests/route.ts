import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  createRequest,
  listRequestAssignees,
  listRequests
} from "@/lib/services/requestService";
import { createRequestSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser("crm:read");
    const [requests, assignees] = await Promise.all([
      listRequests(),
      listRequestAssignees()
    ]);
    return NextResponse.json({ requests, assignees });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser("crm:write");
    const payload = createRequestSchema.parse(await request.json());
    const requestRecord = await createRequest(payload, user);
    return NextResponse.json({ request: requestRecord }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
