import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { importClientInfo } from "@/lib/services/clientService";
import { importClientInfoSchema } from "@/lib/validations/client";

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
    const payload = importClientInfoSchema.parse(await request.json());
    const client = await importClientInfo(id, payload, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

