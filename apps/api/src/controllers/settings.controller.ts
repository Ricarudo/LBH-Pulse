import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  createLocalUser,
  listLocalUsers,
  resetLocalUserPassword,
  updateLocalUser
} from "@/lib/services/localUserService";
import {
  archiveRequestChecklistTemplate,
  createRequestChecklistTemplate,
  duplicateRequestChecklistTemplate,
  listRequestChecklistTemplates,
  restoreRequestChecklistTemplate,
  updateRequestChecklistTemplate
} from "@/lib/services/requestChecklistTemplateService";
import {
  getUserPreferences,
  getWorkspaceSettings,
  updateUserPreferences,
  updateWorkspaceSettings
} from "@/lib/services/settingsService";
import {
  createLocalUserSchema,
  resetLocalUserPasswordSchema,
  updateLocalUserSchema
} from "@pulse/contracts/local-users";
import {
  createRequestChecklistTemplateSchema,
  updateRequestChecklistTemplateSchema
} from "@pulse/contracts/request-checklists";
import {
  userPreferencesSchema,
  workspaceSettingsSchema
} from "@pulse/contracts/settings";
import { AuthService } from "@/shared/auth.service";
import {
  archiveAccessRole,
  createAccessRole,
  listAccessRoles,
  listRoleOptions,
  restoreAccessRole,
  saveAccessRoleMatrix
} from "@/lib/services/roleAccessService";
import {
  archiveAccessRoleSchema,
  createAccessRoleSchema,
  restoreAccessRoleSchema,
  saveAccessRoleMatrixSchema
} from "@pulse/contracts/access-control";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("preferences")
  async preferences(@Req() request: Request) {
    const user = await this.auth.requireUser(request);
    return { preferences: await getUserPreferences(user.id) };
  }

  @Patch("preferences")
  async savePreferences(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request);
    const payload = userPreferencesSchema.parse(body);
    return { preferences: await updateUserPreferences(user.id, payload) };
  }

  @Get("workspace")
  async workspace(@Req() request: Request) {
    await this.auth.requireUser(request);
    return { workspace: await getWorkspaceSettings() };
  }

  @Patch("workspace")
  async saveWorkspace(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "settings:write");
    const payload = workspaceSettingsSchema.parse(body);
    return { workspace: await updateWorkspaceSettings(payload, user) };
  }

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

  @Get("role-options")
  async roleOptions(@Req() request: Request) {
    const user = await this.auth.requireUser(request, "users:manage");
    return { roles: await listRoleOptions(user) };
  }

  @Get("roles")
  async roles(@Req() request: Request) {
    const user = await this.auth.requireSystemAdmin(request);
    return { roles: await listAccessRoles(user) };
  }

  @Post("roles")
  async createRole(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireSystemAdmin(request);
    return { role: await createAccessRole(createAccessRoleSchema.parse(body), user) };
  }

  @Put("roles/matrix")
  async saveRoleMatrix(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireSystemAdmin(request);
    return { roles: await saveAccessRoleMatrix(saveAccessRoleMatrixSchema.parse(body), user) };
  }

  @Post("roles/:roleId/archive")
  async archiveRole(
    @Req() request: Request,
    @Param("roleId") roleId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireSystemAdmin(request);
    await archiveAccessRole(roleId, archiveAccessRoleSchema.parse(body), user);
    return { roles: await listAccessRoles(user) };
  }

  @Post("roles/:roleId/restore")
  async restoreRole(
    @Req() request: Request,
    @Param("roleId") roleId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireSystemAdmin(request);
    await restoreAccessRole(roleId, restoreAccessRoleSchema.parse(body), user);
    return { roles: await listAccessRoles(user) };
  }

  @Get("request-checklists")
  async requestChecklists(@Req() request: Request) {
    await this.auth.requireUser(request, "settings:read");
    const templates = await listRequestChecklistTemplates();
    return { templates };
  }

  @Post("request-checklists")
  async createRequestChecklist(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "settings:write");
    const payload = createRequestChecklistTemplateSchema.parse(body);
    return { template: await createRequestChecklistTemplate(payload, user) };
  }

  @Post("request-checklists/:templateId/duplicate")
  async duplicateRequestChecklist(@Req() request: Request, @Param("templateId") templateId: string) {
    const user = await this.auth.requireUser(request, "settings:write");
    return { template: await duplicateRequestChecklistTemplate(templateId, user) };
  }

  @Post("request-checklists/:templateId/archive")
  async archiveRequestChecklist(@Req() request: Request, @Param("templateId") templateId: string) {
    const user = await this.auth.requireUser(request, "settings:write");
    return { template: await archiveRequestChecklistTemplate(templateId, user) };
  }

  @Post("request-checklists/:templateId/restore")
  async restoreRequestChecklist(@Req() request: Request, @Param("templateId") templateId: string) {
    const user = await this.auth.requireUser(request, "settings:write");
    return { template: await restoreRequestChecklistTemplate(templateId, user) };
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
