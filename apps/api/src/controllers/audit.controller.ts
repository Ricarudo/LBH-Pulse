import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { auditLogQuerySchema } from "@pulse/contracts/audit";
import { listAuditEvents } from "@/lib/services/auditService";
import { AuthError, AuthService } from "@/shared/auth.service";

@Controller("audit")
export class AuditController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    const user = await this.auth.requireUser(request, "audit:read");
    if (!user.isSystemAdmin) {
      throw new AuthError("Administrator access is required.", 403);
    }
    const filters = auditLogQuerySchema.parse(query);
    return listAuditEvents(filters, user);
  }
}
