import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  createLocalUser,
  listLocalUsers,
  resetLocalUserPassword,
  updateLocalUser
} from "@/lib/services/localUserService";
import {
  listRequestChecklistTemplates,
  updateRequestChecklistTemplate
} from "@/lib/services/requestChecklistTemplateService";
import {
  createLocalUserSchema,
  resetLocalUserPasswordSchema,
  updateLocalUserSchema
} from "@/lib/validations/localUser";
import { updateRequestChecklistTemplateSchema } from "@/lib/validations/requestChecklistTemplate";
import { AuthService } from "@/shared/auth.service";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("accounts")
  async accounts(@Req() request: Request) {
    await this.auth.requireUser(request, "users:manage");
    const users = await listLocalUsers();
    return { users };
  }

  @Post("accounts")
  async createAccount(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "users:manage");
    const payload = createLocalUserSchema.parse(body);
    const account = await createLocalUser(payload, user);
    return { user: account };
  }

  @Patch("accounts/:userId")
  async updateAccount(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "users:manage");
    const payload = updateLocalUserSchema.parse(body);
    const account = await updateLocalUser(userId, payload, user);
    return { user: account };
  }

  @Post("accounts/:userId/reset-password")
  async resetAccountPassword(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "users:manage");
    const payload = resetLocalUserPasswordSchema.parse(body);
    const account = await resetLocalUserPassword(userId, payload, user);
    return { user: account };
  }

  @Get("request-checklists")
  async requestChecklists(@Req() request: Request) {
    await this.auth.requireUser(request, "settings:read");
    const templates = await listRequestChecklistTemplates();
    return { templates };
  }

  @Patch("request-checklists/:templateId")
  async updateRequestChecklist(
    @Req() request: Request,
    @Param("templateId") templateId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "settings:write");
    const payload = updateRequestChecklistTemplateSchema.parse(body);
    const template = await updateRequestChecklistTemplate(templateId, payload, user);
    return { template };
  }
}
