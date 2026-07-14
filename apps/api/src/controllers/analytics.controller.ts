import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "@/shared/auth.service";
import { getAnalytics, getAnalyticsDetails } from "@/lib/services/analyticsService";
import {
  analyticsDetailsQuerySchema,
  analyticsQuerySchema
} from "@pulse/contracts/analytics";

@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async summary(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const user = await this.auth.requireUser(request, "analytics:read");
    return getAnalytics(user, analyticsQuerySchema.parse(query));
  }

  @Get("details")
  async details(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const user = await this.auth.requireUser(request, "analytics:read");
    return getAnalyticsDetails(user, analyticsDetailsQuerySchema.parse(query));
  }
}
