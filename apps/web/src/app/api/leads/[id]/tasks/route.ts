import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { createLeadTask } from "@/lib/services/leadService";
import { createLeadTaskSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const payload = createLeadTaskSchema.parse(await request.json());
    const lead = await createLeadTask(id, payload);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

