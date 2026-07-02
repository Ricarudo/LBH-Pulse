import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createInvoice, listInvoices } from "@/lib/services/workService";
import { createInvoiceSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireUser("crm:read"); return NextResponse.json({ invoices: await listInvoices() }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser("crm:write");
    const invoice = await createInvoice(createInvoiceSchema.parse(await request.json()), user);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) { return apiError(error); }
}

