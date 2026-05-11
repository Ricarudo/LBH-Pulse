import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { changeLeadStatus } from "@/lib/services/leadService";
import { changeLeadStatusSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const payload = changeLeadStatusSchema.parse(await request.json());
    const lead = await changeLeadStatus(id, payload.status);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

