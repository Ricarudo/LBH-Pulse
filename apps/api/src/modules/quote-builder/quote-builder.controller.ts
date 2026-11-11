import { Body, Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { calculateBuilderSchema, saveBuilderSchema } from "@pulse/contracts/quote-builder";
import { AuthService } from "@/shared/auth.service";
import { QuoteBuilderService } from "./quote-builder.service";

@Controller("quotes/:quoteId/builder")
export class QuoteBuilderController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(QuoteBuilderService) private readonly builder: QuoteBuilderService) {}
  @Get()
  async load(@Req() request: Request, @Param("quoteId") quoteId: string) {
    await this.auth.requireUser(request, "quotes:read");
    return this.builder.load(quoteId);
  }
  @Put()
  async save(@Req() request: Request, @Param("quoteId") quoteId: string, @Body() body: unknown) {
    await this.auth.requireUser(request, "quotes:write");
    return this.builder.save(quoteId, saveBuilderSchema.parse(body));
  }
  @Post("calculate")
  async calculate(@Req() request: Request, @Param("quoteId") quoteId: string, @Body() body: unknown) {
    await this.auth.requireUser(request, "quotes:read");
    const input = calculateBuilderSchema.parse(body);
    return this.builder.calculate(quoteId, input.state, input.configurationId);
  }
}
