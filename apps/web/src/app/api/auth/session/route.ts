import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
