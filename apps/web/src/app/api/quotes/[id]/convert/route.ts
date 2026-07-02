import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { convertQuoteToProject } from "@/lib/services/workService";
import { convertQuoteSchema } from "@/lib/validations/work";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    const project = await convertQuoteToProject((await params).id, convertQuoteSchema.parse(await request.json()), user);
    return NextResponse.json({ project });
  } catch (error) { return apiError(error); }
}

