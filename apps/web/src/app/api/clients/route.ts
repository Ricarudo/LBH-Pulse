import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createClient, listClients } from "@/lib/services/clientService";
import { createClientSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser("crm:read");
    const clients = await listClients();
    return NextResponse.json({ clients });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser("crm:write");
    const payload = createClientSchema.parse(await request.json());
    const client = await createClient(payload, user);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

