import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  archiveClient,
  getClientById,
  updateClient
} from "@/lib/services/clientService";
import { updateClientSchema } from "@/lib/validations/client";

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
    const client = await getClientById(id);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const payload = updateClientSchema.parse(await request.json());
    const client = await updateClient(id, payload, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const client = await archiveClient(id, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

