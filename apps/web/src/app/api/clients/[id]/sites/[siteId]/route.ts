import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  removeClientSite,
  updateClientSite
} from "@/lib/services/clientService";
import { updateClientSiteSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    siteId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id, siteId } = await params;
    const payload = updateClientSiteSchema.parse(await request.json());
    const client = await updateClientSite(id, siteId, payload, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id, siteId } = await params;
    const client = await removeClientSite(id, siteId, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

