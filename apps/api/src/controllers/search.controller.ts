import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { searchPulse } from "@/lib/services/searchService";
import { globalSearchQuerySchema } from "@pulse/contracts/search";
import { AuthService } from "@/shared/auth.service";

@Controller("search")
export class SearchController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async search(@Req() request: Request, @Query() query: unknown) {
    const user = await this.auth.requireUser(request, {
      anyOf: [
        "requests:read", "clients:read", "items:read", "quotes:read",
        "projects:read", "billing:read"
      ]
    });
    const input = globalSearchQuerySchema.parse(query);
    return searchPulse(input.q, user);
  }
}
