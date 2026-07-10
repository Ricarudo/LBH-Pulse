import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  addAdHocQuoteItem,
  addQuoteItem
} from "@/lib/services/workService";
import {
  addAdHocQuoteItemSchema,
  addQuoteItemSchema
} from "@/lib/validations/item";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const body = await request.json();
    const { mode: _mode, ...payload } = body ?? {};
    const quote =
      body?.mode === "adHoc"
        ? await addAdHocQuoteItem(id, addAdHocQuoteItemSchema.parse(payload), user)
        : await addQuoteItem(id, addQuoteItemSchema.parse(payload), user);
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
