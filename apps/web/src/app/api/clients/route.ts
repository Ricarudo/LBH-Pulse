import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { createClient, listClients } from "@/lib/services/clientService";
import { createClientSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clients = await listClients();
    return NextResponse.json({ clients });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createClientSchema.parse(await request.json());
    const client = await createClient(payload);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

