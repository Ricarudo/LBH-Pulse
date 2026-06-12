import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { AuthError, requireUser } from "@/lib/auth/session";
import { addClientContact } from "@/lib/services/clientService";
import { addClientContactSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const { id } = await params;
    const payload = addClientContactSchema.parse(await request.json());
    const client = await addClientContact(id, payload, user);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

