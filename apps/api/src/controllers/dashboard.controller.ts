import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Put,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import {
  getDashboardData,
  getDashboardPreferences,
  resetDashboardPreferences,
  updateDashboardPreferences
} from "@/lib/services/dashboardService";
import {
  dashboardPreferencesSchema,
  dashboardScopeSchema,
  dashboardWidgetIdSchema
} from "@pulse/contracts/dashboard";
import { AuthService } from "@/shared/auth.service";
import { dashboardWidgetIds, type DashboardWidgetId } from "@pulse/contracts/dashboard";

@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("preferences")
  async preferences(@Req() request: Request) {
    const user = await this.auth.requireUser(request);
    return { preferences: await getDashboardPreferences(user) };
  }

  @Put("preferences")
  async savePreferences(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request);
    const payload = dashboardPreferencesSchema.parse(body);
    return {
      preferences: await updateDashboardPreferences(user, payload)
    };
  }

  @Delete("preferences")
  async resetPreferences(@Req() request: Request) {
    const user = await this.auth.requireUser(request);
    return { preferences: await resetDashboardPreferences(user) };
  }

  @Get()
  async data(
    @Req() request: Request,
    @Query("scope") scopeQuery?: string,
    @Query("widgets") widgetsQuery?: string
  ) {
    const user = await this.auth.requireUser(request, "crm:read");
    const scope = scopeQuery
      ? dashboardScopeSchema.parse(scopeQuery)
      : undefined;
    const requestedWidgets = widgetsQuery
      ? Array.from(new Set(
          widgetsQuery
            .split(",")
            .filter(Boolean)
            .map((id) => dashboardWidgetIdSchema.parse(id))
        )) as DashboardWidgetId[]
      : [...dashboardWidgetIds];
    return getDashboardData(user, scope, requestedWidgets);
  }
}
