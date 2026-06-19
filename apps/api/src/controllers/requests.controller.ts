import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import {
  addRequestActivity,
  archiveRequest,
  changeRequestStatus,
  completeRequestTask,
  convertRequest,
  createRequest,
  createRequestTask,
  getRequestById,
  listRequestAssignees,
  listRequests,
  updateRequest,
  updateRequestChecklistItem
} from "@/lib/services/requestService";
import {
  changeRequestStatusSchema,
  completeRequestTaskSchema,
  convertRequestSchema,
  createRequestActivitySchema,
  createRequestSchema,
  createRequestTaskSchema,
  updateRequestChecklistItemSchema,
  updateRequestSchema
} from "@/lib/validations/request";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";

const uploadDirectory = process.env.DOCUMENT_TEMP_DIR || "/tmp/pulse-uploads";
mkdirSync(uploadDirectory, { recursive: true });

@Controller("requests")
export class RequestsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(@Req() request: Request) {
    await this.auth.requireUser(request, "crm:read");
    const [requests, assignees] = await Promise.all([
      listRequests(),
      listRequestAssignees()
    ]);
    return { requests, assignees };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = createRequestSchema.parse(body);
    const requestRecord = await createRequest(payload, user);
    return { request: requestRecord };
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "crm:read");
    const requestRecord = await getRequestById(id);
    return { request: requestRecord };
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = updateRequestSchema.parse(body);
    const requestRecord = await updateRequest(id, payload, user);
    return { request: requestRecord };
  }

  @Delete(":id")
  async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "crm:write");
    const requestRecord = await archiveRequest(id, user);
    return { request: requestRecord };
  }

  @Patch(":id/status")
  async changeStatus(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = changeRequestStatusSchema.parse(body);
    const requestRecord = await changeRequestStatus(id, payload.status, user);
    return { request: requestRecord };
  }

  @Post(":id/convert")
  @HttpCode(200)
  async convert(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const payload = convertRequestSchema.parse(body);
    const requestRecord = await convertRequest(id, payload, user);
    return { request: requestRecord };
  }

  @Post(":id/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({ destination: uploadDirectory }),
      limits: { fileSize: 100 * 1024 * 1024 }
    })
  )
  async uploadDocument(
    @Req() request: Request,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("category") category = "Other"
  ) {
    const user = await this.auth.requireUser(request, "crm:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("request", id, file, category, user) };
  }

  @Post(":id/activities")
  async addActivity(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = createRequestActivitySchema.parse(body);
    const requestRecord = await addRequestActivity(id, payload, user);
    return { request: requestRecord };
  }

  @Post(":id/tasks")
  async addTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = createRequestTaskSchema.parse(body);
    const requestRecord = await createRequestTask(id, payload, user);
    return { request: requestRecord };
  }

  @Patch(":id/tasks/:taskId")
  async completeTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = completeRequestTaskSchema.parse(body);
    const requestRecord = await completeRequestTask(
      id,
      taskId,
      payload.completed,
      user
    );
    return { request: requestRecord };
  }

  @Patch(":id/checklist/:itemId")
  async updateChecklistItem(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:activity:write");
    const payload = updateRequestChecklistItemSchema.parse(body);
    const requestRecord = await updateRequestChecklistItem(id, itemId, payload, user);
    return { request: requestRecord };
  }
}
