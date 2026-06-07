import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { listClientRelatedWork } from "@/lib/services/requestService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser("crm:read");
    const { id } = await params;
    return NextResponse.json(await listClientRelatedWork(id));
  } catch (error) {
    return apiError(error);
  }
}
