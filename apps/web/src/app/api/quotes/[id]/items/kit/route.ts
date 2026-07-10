import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { addQuoteKit } from "@/lib/services/workService";
import { addQuoteKitSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const quote = await addQuoteKit(id, addQuoteKitSchema.parse(await request.json()), user);
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
