import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { createLead, listLeads } from "@/lib/services/leadService";
import { createLeadSchema } from "@/lib/validations/lead";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leads = await listLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createLeadSchema.parse(await request.json());
    const lead = await createLead(payload);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

