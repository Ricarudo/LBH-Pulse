import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { addRequestActivity } from "@/lib/services/requestService";
import { createRequestActivitySchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:activity:write");
    const { id } = await params;
    const payload = createRequestActivitySchema.parse(await request.json());
    const requestRecord = await addRequestActivity(id, payload, user);
    return NextResponse.json({ request: requestRecord }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
