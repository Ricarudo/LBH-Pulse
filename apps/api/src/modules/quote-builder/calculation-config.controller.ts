import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { saveCalculationSettingsSchema, saveLaborClassSchema } from "@pulse/contracts/quote-builder";
import { AuthService } from "@/shared/auth.service";
import { CalculationConfigService } from "./calculation-config.service";

@Controller("settings")
export class CalculationConfigController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(CalculationConfigService) private readonly config: CalculationConfigService) {}
  @Get("quote-calculation")
  async read(@Req() request: Request) {
    await this.auth.requireUser(request, { anyOf: ["quotes:read", "items:read", "settings:read"] });
    return this.config.read();
  }
  @Put("quote-calculation")
  async save(@Req() request: Request, @Body() body: unknown) {
    await this.auth.requireUser(request, "settings:write");
    const input = saveCalculationSettingsSchema.parse(body);
    return this.config.saveSettings(input.settings, input.expectedConfigurationId);
  }
  @Post("labor-classes")
  async addClass(@Req() request: Request, @Body() body: unknown) {
    await this.auth.requireUser(request, "settings:write");
    return this.config.saveClass(saveLaborClassSchema.parse(body));
  }
  @Patch("labor-classes/:id")
  async updateClass(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    await this.auth.requireUser(request, "settings:write");
    return this.config.saveClass(saveLaborClassSchema.parse(body), id);
  }
}
