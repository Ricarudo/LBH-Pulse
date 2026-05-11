import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { completeLeadTask } from "@/lib/services/leadService";
import { completeLeadTaskSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    taskId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id, taskId } = await params;
    const payload = completeLeadTaskSchema.parse(await request.json());
    const lead = await completeLeadTask(id, taskId, payload.completed);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

