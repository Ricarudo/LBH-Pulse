import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
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
    const { id } = await params;
    const payload = addClientContactSchema.parse(await request.json());
    const client = await addClientContact(id, payload);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

