import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import {
  addRequestActivity,
  addRequestCollaborator,
  archiveRequest,
  changeRequestStatus,
  completeRequestUpdate,
  completeRequestTask,
  convertRequest,
  createRequestUpdate,
  createRequest,
  createRequestTask,
  getRequestById,
  listRequestAssignees,
  listRequestTeamMembers,
  listRequests,
  listRequestUpdates,
  markRequestMentionsRead,
  removeRequestCollaborator,
  undoRequestUpdate,
  updateRequestLead,
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
  createRequestUpdateSchema,
  updateRequestChecklistItemSchema,
  requestCollaboratorSchema,
  requestUpdateCompleteSchema,
  requestUpdateFilterSchema,
  requestTeamLeadSchema,
  updateRequestSchema
} from "@pulse/contracts/requests";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";

const uploadDirectory = process.env.DOCUMENT_TEMP_DIR || "/tmp/pulse-uploads";
mkdirSync(uploadDirectory, { recursive: true });

@Controller("requests")
export class RequestsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.auth.requireUser(request, "requests:read");
    const [requests, assignees, teamMembers] = await Promise.all([
      listRequests(user.id),
      listRequestAssignees(),
      listRequestTeamMembers()
    ]);
    return { requests, assignees, teamMembers };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "requests:write");
    const payload = createRequestSchema.parse(body);
    const requestRecord = await createRequest(payload, user);
    return { request: requestRecord };
  }

  @Get("team-members")
  async teamMembers(@Req() request: Request) {
    await this.auth.requireUser(request, "requests:read");
    return { teamMembers: await listRequestTeamMembers() };
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "requests:read");
    const requestRecord = await getRequestById(id, user.id);
    return { request: requestRecord };
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "requests:write");
    const payload = updateRequestSchema.parse(body);
    const requestRecord = await updateRequest(id, payload, user);
    return { request: requestRecord };
  }

  @Delete(":id")
  async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "requests:write");
    const requestRecord = await archiveRequest(id, user);
    return { request: requestRecord };
  }

  @Patch(":id/status")
  async changeStatus(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "requests:write");
    const payload = changeRequestStatusSchema.parse(body);
    const requestRecord = await changeRequestStatus(
      id,
      payload.status,
      user,
      payload.reason
    );
    return { request: requestRecord };
  }

  @Post(":id/convert")
  @HttpCode(200)
  async convert(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:write", "quotes:write"] });
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
    @Body("category") category = "Other",
    @Body("tags") tags?: string
  ) {
    const user = await this.auth.requireUser(request, "requests:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("request", id, file, category, user, tags) };
  }

  @Post(":id/activities")
  async addActivity(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
    const payload = createRequestActivitySchema.parse(body);
    const requestRecord = await addRequestActivity(id, payload, user);
    return { request: requestRecord };
  }

  @Get(":id/updates")
  async listUpdates(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("kind") kind = "all",
    @Query("cursor") cursor?: string,
    @Query("take") take?: string
  ) {
    const user = await this.auth.requireUser(request, "requests:read");
    const filter = requestUpdateFilterSchema.parse(kind);
    return listRequestUpdates(id, filter, cursor, Number(take) || 25, user.id);
  }

  @Post(":id/updates")
  async postUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
    const payload = createRequestUpdateSchema.parse(body);
    return { request: await createRequestUpdate(id, payload, user) };
  }

  @Post(":id/updates/:updateId/complete")
  @HttpCode(200)
  async completeUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
    const payload = requestUpdateCompleteSchema.parse(body ?? {});
    return {
      request: payload.completed === false
        ? await undoRequestUpdate(id, updateId, user)
        : await completeRequestUpdate(id, updateId, user)
    };
  }

  @Post(":id/updates/:updateId/undo")
  @HttpCode(200)
  async undoUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
    return { request: await undoRequestUpdate(id, updateId, user) };
  }

  @Post(":id/mentions/read")
  @HttpCode(200)
  async readMentions(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "requests:read");
    return markRequestMentionsRead(id, user.id);
  }

  @Patch(":id/lead")
  async updateLead(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "requests:write");
    const payload = requestTeamLeadSchema.parse(body);
    return { request: await updateRequestLead(id, payload.leadId || null, user) };
  }

  @Post(":id/collaborators")
  async addCollaborator(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "requests:write");
    const payload = requestCollaboratorSchema.parse(body);
    return { request: await addRequestCollaborator(id, payload.userId, user) };
  }

  @Delete(":id/collaborators/:userId")
  async removeCollaborator(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("userId") userId: string
  ) {
    const user = await this.auth.requireUser(request, "requests:write");
    return { request: await removeRequestCollaborator(id, userId, user) };
  }

  @Post(":id/tasks")
  async addTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
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
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
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
    const user = await this.auth.requireUser(request, { allOf: ["requests:read", "activity:write"] });
    const payload = updateRequestChecklistItemSchema.parse(body);
    const requestRecord = await updateRequestChecklistItem(id, itemId, payload, user);
    return { request: requestRecord };
  }
}
