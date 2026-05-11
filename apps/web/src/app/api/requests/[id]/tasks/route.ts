import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createRequestTask } from "@/lib/services/requestService";
import { createRequestTaskSchema } from "@/lib/validations/request";

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
    const payload = createRequestTaskSchema.parse(await request.json());
    const requestRecord = await createRequestTask(id, payload, user);
    return NextResponse.json({ request: requestRecord }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
