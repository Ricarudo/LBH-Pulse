import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { convertLead } from "@/lib/services/leadService";
import { convertLeadSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const payload = convertLeadSchema.parse(await request.json());
    const lead = await convertLead(id, payload);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}

