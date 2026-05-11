import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { convertRequest } from "@/lib/services/requestService";
import { convertRequestSchema } from "@/lib/validations/request";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const payload = convertRequestSchema.parse(await request.json());
    const requestRecord = await convertRequest(id, payload, user);
    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    return apiError(error);
  }
}
