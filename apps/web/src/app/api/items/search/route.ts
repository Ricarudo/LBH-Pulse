import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { searchActiveItems } from "@/lib/services/itemService";
import { itemSearchSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser("crm:read");
    const url = new URL(request.url);
    const input = itemSearchSchema.parse(Object.fromEntries(url.searchParams.entries()));
    return NextResponse.json({ items: await searchActiveItems(input) });
  } catch (error) {
    return apiError(error);
  }
}
