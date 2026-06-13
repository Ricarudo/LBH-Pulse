import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { archiveProject, createInvoiceFromProject, createProject, getProjectById, listProjects, updateProject } from "@/lib/services/workService";
import { createProjectInvoiceSchema, createProjectSchema, updateProjectSchema } from "@/lib/validations/work";
import { AuthService } from "@/shared/auth.service";

@Controller("projects")
export class ProjectsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get() async list(@Req() request: Request) { await this.auth.requireUser(request, "crm:read"); return { projects: await listProjects() }; }
  @Post() async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { project: await createProject(createProjectSchema.parse(body), user) };
  }
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "crm:read"); return { project: await getProjectById(id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { project: await updateProject(id, updateProjectSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "crm:write"); return { project: await archiveProject(id, user) };
  }
  @Post(":id/invoices") async invoice(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { invoice: await createInvoiceFromProject(id, createProjectInvoiceSchema.parse(body), user) };
  }
}

