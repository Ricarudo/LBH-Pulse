import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createItem, listItems } from "@/lib/services/itemService";
import { createItemSchema, itemSearchSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

function queryInput(request: Request) {
  const url = new URL(request.url);
  return itemSearchSchema.parse(Object.fromEntries(url.searchParams.entries()));
}

export async function GET(request: Request) {
  try {
    await requireUser("crm:read");
    return NextResponse.json({ items: await listItems(queryInput(request)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser("crm:write");
    const item = await createItem(createItemSchema.parse(await request.json()));
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
