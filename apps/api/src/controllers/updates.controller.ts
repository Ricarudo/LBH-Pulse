import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { updateApplySchema, type UpdateApplyResponse, type UpdateJob } from "@pulse/contracts/updates";
import { AuthError, AuthService } from "@/shared/auth.service";
import { updateStatus, updaterRequest } from "@/lib/services/updateService";
import { recordActivity } from "@/lib/services/activityService";

@Controller("system/updates")
export class UpdatesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get()
  async status(@Req() request: Request) {
    await this.auth.requireUser(request, "system:updates:read");
    return updateStatus();
  }
  @Post("check")
  @HttpCode(200)
  async check(@Req() request: Request) {
    await this.auth.requireUser(request, "system:updates:read");
    return updaterRequest("/check", {});
  }
  @Post("apply")
  @HttpCode(202)
  async apply(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "system:updates:apply");
    if (!user.isSystemAdmin) throw new AuthError("Administrator access is required.", 403);
    const input = updateApplySchema.parse(body);
    // Commit authorization evidence before the updater is permitted to stop API.
    await recordActivity({ user, relatedEntityType: "SystemUpdate", relatedEntityId: input.idempotencyKey, type: "Update Requested", title: `Pulse ${input.releaseId} update requested`, metadata: { releaseId: input.releaseId, idempotencyKey: input.idempotencyKey } });
    return updaterRequest<UpdateApplyResponse>("/apply", { ...input, actor: { id: user.id, name: user.name } });
  }
  @Get("jobs/:id")
  async job(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "system:updates:read");
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AuthError("Invalid update job.", 400);
    return updaterRequest<{ job: UpdateJob }>(`/jobs/${id}`);
  }
}
