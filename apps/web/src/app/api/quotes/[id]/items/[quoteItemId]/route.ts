import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  removeQuoteItem,
  updateQuoteItem
} from "@/lib/services/workService";
import { updateQuoteItemSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; quoteItemId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id, quoteItemId } = await params;
    const quote = await updateQuoteItem(
      id,
      quoteItemId,
      updateQuoteItemSchema.parse(await request.json()),
      user
    );
    return NextResponse.json({ quote });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id, quoteItemId } = await params;
    return NextResponse.json({ quote: await removeQuoteItem(id, quoteItemId, user) });
  } catch (error) {
    return apiError(error);
  }
}
