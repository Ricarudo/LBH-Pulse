import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import {
  archiveInvoice,
  createInvoice,
  getInvoiceById,
  listInvoices,
  updateInvoice
} from "@/lib/services/workService";
import { createInvoiceSchema, updateInvoiceSchema } from "@pulse/contracts/work";
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

@Controller("invoices")
export class InvoicesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(@Req() request: Request) {
    await this.auth.requireUser(request, "billing:read");
    return { invoices: await listInvoices() };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "billing:write");
    return { invoice: await createInvoice(createInvoiceSchema.parse(body), user) };
  }

  @Get("team-members")
  async teamMembers(@Req() request: Request) {
    await this.auth.requireUser(request, "billing:read");
    return listWorkUsers("invoice");
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "billing:read");
    return { invoice: await getInvoiceById(id, user.id) };
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "billing:write");
    return { invoice: await updateInvoice(id, updateInvoiceSchema.parse(body), user) };
  }

  @Delete(":id")
  async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "billing:write");
    return { invoice: await archiveInvoice(id, user) };
  }

  @Get(":id/updates")
  async listUpdates(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("kind") kind = "all",
    @Query("cursor") cursor?: string,
    @Query("take") take?: string
  ) {
    const user = await this.auth.requireUser(request, "billing:read");
    return listWorkUpdates("invoice", id, requestUpdateFilterSchema.parse(kind), cursor, Number(take) || 25, user.id);
  }

  @Post(":id/updates")
  async postUpdate(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["billing:read", "activity:write"] });
    return createWorkUpdate("invoice", id, createRequestUpdateSchema.parse(body), user);
  }

  @Post(":id/updates/:updateId/complete")
  @HttpCode(200)
  async completeUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["billing:read", "activity:write"] });
    const payload = requestUpdateCompleteSchema.parse(body ?? {});
    return payload.completed === false
      ? undoWorkUpdate("invoice", id, updateId, user)
      : completeWorkUpdate("invoice", id, updateId, user);
  }

  @Post(":id/updates/:updateId/undo")
  @HttpCode(200)
  async undoUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["billing:read", "activity:write"] });
    return undoWorkUpdate("invoice", id, updateId, user);
  }

  @Post(":id/mentions/read")
  @HttpCode(200)
  async readMentions(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "billing:read");
    return markWorkMentionsRead("invoice", id, user.id);
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
    const user = await this.auth.requireUser(request, "billing:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("invoice", id, file, category, user, tags) };
  }
}
