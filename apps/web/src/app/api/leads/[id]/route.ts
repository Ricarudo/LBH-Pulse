import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import {
  archiveLead,
  getLeadById,
  updateLead
} from "@/lib/services/leadService";
import { updateLeadSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const payload = updateLeadSchema.parse(await request.json());
    const lead = await updateLead(id, payload);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const lead = await archiveLead(id);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

