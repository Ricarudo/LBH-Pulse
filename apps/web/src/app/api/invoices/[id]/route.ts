import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { archiveInvoice, getInvoiceById, updateInvoice } from "@/lib/services/workService";
import { updateInvoiceSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { await requireUser("crm:read"); return NextResponse.json({ invoice: await getInvoiceById((await params).id) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ invoice: await updateInvoice((await params).id, updateInvoiceSchema.parse(await request.json()), user) });
  } catch (error) { return apiError(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ invoice: await archiveInvoice((await params).id, user) });
  } catch (error) { return apiError(error); }
}

