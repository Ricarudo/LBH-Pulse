import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { archiveQuote, getQuoteById, updateQuote } from "@/lib/services/workService";
import { updateQuoteSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try { await requireUser("crm:read"); return NextResponse.json({ quote: await getQuoteById((await params).id) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ quote: await updateQuote((await params).id, updateQuoteSchema.parse(await request.json()), user) });
  } catch (error) { return apiError(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ quote: await archiveQuote((await params).id, user) });
  } catch (error) { return apiError(error); }
}

