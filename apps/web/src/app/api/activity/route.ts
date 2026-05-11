import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { listActivities } from "@/lib/services/activityService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser("activity:read");
    const url = new URL(request.url);
    const relatedEntityType = url.searchParams.get("relatedEntityType") ?? undefined;
    const relatedEntityId = url.searchParams.get("relatedEntityId") ?? undefined;
    const requestedTake = Number(url.searchParams.get("take") ?? 50);
    const take = Number.isFinite(requestedTake)
      ? Math.min(Math.max(Math.trunc(requestedTake), 1), 100)
      : 50;
    const activities = await listActivities(user, {
      relatedEntityType,
      relatedEntityId,
      take
    });

    return NextResponse.json({ activities });
  } catch (error) {
    return apiError(error);
  }
}
