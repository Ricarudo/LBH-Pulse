import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { AuthError, requireUser } from "@/lib/auth/session";
import {
  removeClientContact,
  updateClientContact
} from "@/lib/services/clientService";
import { updateClientContactSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    contactId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const { id, contactId } = await params;
    const payload = updateClientContactSchema.parse(await request.json());
    const client = await updateClientContact(id, contactId, payload, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const { id, contactId } = await params;
    const client = await removeClientContact(id, contactId, user);
    return NextResponse.json({ client });
  } catch (error) {
    return apiError(error);
  }
}

