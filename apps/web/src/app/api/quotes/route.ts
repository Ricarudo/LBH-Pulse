import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createQuote, listQuotes } from "@/lib/services/workService";
import { createQuoteSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser("crm:read");
    return NextResponse.json({ quotes: await listQuotes() });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser("crm:write");
    const quote = await createQuote(createQuoteSchema.parse(await request.json()), user);
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) { return apiError(error); }
}

