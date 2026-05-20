import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { listActivities } from "@/lib/services/activityService";
import { AuthService } from "@/shared/auth.service";

@Controller("activity")
export class ActivityController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("relatedEntityType") relatedEntityType?: string,
    @Query("relatedEntityId") relatedEntityId?: string,
    @Query("take") takeQuery?: string
  ) {
    const user = await this.auth.requireUser(request, "activity:read");
    const requestedTake = Number(takeQuery ?? 50);
    const take = Number.isFinite(requestedTake)
      ? Math.min(Math.max(Math.trunc(requestedTake), 1), 100)
      : 50;
    const activities = await listActivities(user, {
      relatedEntityType,
      relatedEntityId,
      take
    });

    return { activities };
  }
}
