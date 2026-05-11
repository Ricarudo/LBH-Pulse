import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
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
    const { id, siteId } = await params;
    const payload = updateClientSiteSchema.parse(await request.json());
    const client = await updateClientSite(id, siteId, payload);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id, siteId } = await params;
    const client = await removeClientSite(id, siteId);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

