import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createInvoiceFromProject } from "@/lib/services/workService";
import { createProjectInvoiceSchema } from "@/lib/validations/work";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    const invoice = await createInvoiceFromProject((await params).id, createProjectInvoiceSchema.parse(await request.json()), user);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) { return apiError(error); }
}

