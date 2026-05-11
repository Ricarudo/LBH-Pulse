import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { completeRequestTask } from "@/lib/services/requestService";
import { completeRequestTaskSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    taskId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:activity:write");
    const { id, taskId } = await params;
    const payload = completeRequestTaskSchema.parse(await request.json());
    const requestRecord = await completeRequestTask(
      id,
      taskId,
      payload.completed,
      user
    );
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}
