import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import { archiveProject, createInvoiceFromProject, createProject, getProjectById, listProjects, updateProject } from "@/lib/services/workService";
import { createProjectInvoiceSchema, createProjectSchema, updateProjectSchema } from "@pulse/contracts/work";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";

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
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "projects:read"); return { project: await getProjectById(id) };
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
  @Post(":id/documents")
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({ destination: uploadDirectory }),
    limits: { fileSize: 100 * 1024 * 1024 }
  }))
  async uploadDocument(
    @Req() request: Request,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("category") category = "Other"
  ) {
    const user = await this.auth.requireUser(request, "projects:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("project", id, file, category, user) };
  }
}
