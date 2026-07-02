import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  addClientActivity,
  addClientContact,
  addClientSite,
  archiveClient,
  createClient,
  getClientById,
  importClientInfo,
  listClients,
  removeClientContact,
  removeClientSite,
  updateClient,
  updateClientContact,
  updateClientSite
} from "@/lib/services/clientService";
import { listClientRelatedWork } from "@/lib/services/requestService";
import {
  addClientContactSchema,
  addClientSiteSchema,
  createClientActivitySchema,
  createClientSchema,
  importClientInfoSchema,
  updateClientContactSchema,
  updateClientSchema,
  updateClientSiteSchema
} from "@/lib/validations/client";
import { AuthError, AuthService } from "@/shared/auth.service";

@Controller("clients")
export class ClientsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(@Req() request: Request) {
    await this.auth.requireUser(request, "crm:read");
    const clients = await listClients();
    return { clients };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = createClientSchema.parse(body);
    const client = await createClient(payload, user);
    return { client };
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "crm:read");
    const client = await getClientById(id);
    return { client };
  }

  @Get(":id/related-work")
  async relatedWork(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "crm:read");
    return listClientRelatedWork(id);
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit clients.", 403);
    }

    const payload = updateClientSchema.parse(body);
    const client = await updateClient(id, payload, user);
    return { client };
  }

  @Delete(":id")
  async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "crm:write");
    const client = await archiveClient(id, user);
    return { client };
  }

  @Post(":id/sites")
  async addSite(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = addClientSiteSchema.parse(body);
    const client = await addClientSite(id, payload, user);
    return { client };
  }

  @Patch(":id/sites/:siteId")
  async updateSite(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("siteId") siteId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = updateClientSiteSchema.parse(body);
    const client = await updateClientSite(id, siteId, payload, user);
    return { client };
  }

  @Delete(":id/sites/:siteId")
  async removeSite(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("siteId") siteId: string
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const client = await removeClientSite(id, siteId, user);
    return { client };
  }

  @Post(":id/contacts")
  async addContact(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const payload = addClientContactSchema.parse(body);
    const client = await addClientContact(id, payload, user);
    return { client };
  }

  @Patch(":id/contacts/:contactId")
  async updateContact(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const payload = updateClientContactSchema.parse(body);
    const client = await updateClientContact(id, contactId, payload, user);
    return { client };
  }

  @Delete(":id/contacts/:contactId")
  async removeContact(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("contactId") contactId: string
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to edit client contacts.", 403);
    }

    const client = await removeClientContact(id, contactId, user);
    return { client };
  }

  @Post(":id/activities")
  async addActivity(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = createClientActivitySchema.parse(body);
    const client = await addClientActivity(id, payload, user);
    return { client };
  }

  @Post(":id/import")
  @HttpCode(200)
  async importInfo(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = importClientInfoSchema.parse(body);
    const client = await importClientInfo(id, payload, user);
    return { client };
  }
}
