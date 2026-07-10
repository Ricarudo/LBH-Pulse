import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  getItemById,
  markItemInactive,
  updateItem
} from "@/lib/services/itemService";
import { updateItemSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser("crm:read");
    const { id } = await params;
    return NextResponse.json({ item: await getItemById(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser("crm:write");
    const { id } = await params;
    const item = await updateItem(id, updateItemSchema.parse(await request.json()));
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    await requireUser("crm:write");
    const { id } = await params;
    return NextResponse.json({ item: await markItemInactive(id) });
  } catch (error) {
    return apiError(error);
  }
}
