import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import { archiveProject, createInvoiceFromProject, createProject, getProjectById, listProjects, updateProject } from "@/lib/services/workService";
import { createProjectInvoiceSchema, createProjectSchema, updateProjectSchema } from "@pulse/contracts/work";
import {
  createRequestUpdateSchema,
  requestUpdateCompleteSchema,
  requestUpdateFilterSchema
} from "@pulse/contracts/requests";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";
import {
  completeWorkUpdate,
  createWorkUpdate,
  listWorkUpdates,
  listWorkUsers,
  markWorkMentionsRead,
  undoWorkUpdate
} from "@/lib/services/workUpdateService";

const uploadDirectory = process.env.DOCUMENT_TEMP_DIR || "/tmp/pulse-uploads";
mkdirSync(uploadDirectory, { recursive: true });

@Controller("projects")
export class ProjectsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get() async list(@Req() request: Request) { await this.auth.requireUser(request, "projects:read"); return { projects: await listProjects() }; }
  @Post() async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "projects:write");
    return { project: await createProject(createProjectSchema.parse(body), user) };
  }
  @Get("team-members") async teamMembers(@Req() request: Request) {
    await this.auth.requireUser(request, "projects:read");
    return listWorkUsers("project");
  }
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "projects:read");
    return { project: await getProjectById(id, user.id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "projects:write");
    return { project: await updateProject(id, updateProjectSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "projects:write"); return { project: await archiveProject(id, user) };
  }
  @Post(":id/invoices") async invoice(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["projects:write", "billing:write"] });
    return { invoice: await createInvoiceFromProject(id, createProjectInvoiceSchema.parse(body), user) };
  }
  @Get(":id/updates")
  async listUpdates(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("kind") kind = "all",
    @Query("cursor") cursor?: string,
    @Query("take") take?: string
  ) {
    const user = await this.auth.requireUser(request, "projects:read");
    return listWorkUpdates("project", id, requestUpdateFilterSchema.parse(kind), cursor, Number(take) || 25, user.id);
  }
  @Post(":id/updates")
  async postUpdate(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["projects:read", "activity:write"] });
    return createWorkUpdate("project", id, createRequestUpdateSchema.parse(body), user);
  }
  @Post(":id/updates/:updateId/complete")
  @HttpCode(200)
  async completeUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["projects:read", "activity:write"] });
    const payload = requestUpdateCompleteSchema.parse(body ?? {});
    return payload.completed === false
      ? undoWorkUpdate("project", id, updateId, user)
      : completeWorkUpdate("project", id, updateId, user);
  }
  @Post(":id/updates/:updateId/undo")
  @HttpCode(200)
  async undoUpdate(@Req() request: Request, @Param("id") id: string, @Param("updateId") updateId: string) {
    const user = await this.auth.requireUser(request, { allOf: ["projects:read", "activity:write"] });
    return undoWorkUpdate("project", id, updateId, user);
  }
  @Post(":id/mentions/read")
  @HttpCode(200)
  async readMentions(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "projects:read");
    return markWorkMentionsRead("project", id, user.id);
  }
  @Post(":id/documents")
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({ destination: uploadDirectory }),
    limits: { fileSize: 100 * 1024 * 1024 }
  }))
  async uploadDocument(
    @Req() request: Request,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("category") category = "Other",
    @Body("tags") tags?: string
  ) {
    const user = await this.auth.requireUser(request, "projects:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("project", id, file, category, user, tags) };
  }
}
