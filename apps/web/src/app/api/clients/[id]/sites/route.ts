import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { addClientSite } from "@/lib/services/clientService";
import { addClientSiteSchema } from "@/lib/validations/client";

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
    const payload = addClientSiteSchema.parse(await request.json());
    const client = await addClientSite(id, payload, user);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

