import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import {
  convertQuoteSchema,
  createQuoteRevisionSchema,
  createQuoteSchema,
  replaceLegacyQuoteFinancialsSchema,
  switchQuoteCalculationModeSchema,
  updateQuoteSchema
} from "@pulse/contracts/work";
import {
  createRequestUpdateSchema,
  requestUpdateCompleteSchema,
  requestUpdateFilterSchema
} from "@pulse/contracts/requests";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";
import { QuotesService } from "@/modules/quotes/quotes.service";
import {
  completeQuoteUpdate,
  createQuoteUpdate,
  listQuoteUpdates,
  listQuoteUpdateTeamMembers,
  markQuoteMentionsRead,
  undoQuoteUpdate
} from "@/lib/services/quoteUpdateService";

const uploadDirectory = process.env.DOCUMENT_TEMP_DIR || "/tmp/pulse-uploads";
mkdirSync(uploadDirectory, { recursive: true });

@Controller("quotes")
export class QuotesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(QuotesService) private readonly quotes: QuotesService
  ) {}
  @Get() async list(@Req() request: Request) { await this.auth.requireUser(request, "quotes:read"); return { quotes: await this.quotes.list() }; }
  @Post() async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.create(createQuoteSchema.parse(body), user) };
  }
  @Get("team-members") async teamMembers(@Req() request: Request) {
    await this.auth.requireUser(request, "quotes:read");
    return { teamMembers: await listQuoteUpdateTeamMembers() };
  }
  @Get(":id/revisions/:version")
  async getRevision(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("version") version: string
  ) {
    await this.auth.requireUser(request, "quotes:read");
    return { revision: await this.quotes.getRevision(id, version) };
  }
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "quotes:read");
    return { quote: await this.quotes.get(id, user.id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.update(id, updateQuoteSchema.parse(body), user) };
  }
  @Put(":id/legacy-financials") async replaceLegacyFinancials(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.replaceLegacyFinancials(id, replaceLegacyQuoteFinancialsSchema.parse(body), user) };
  }
  @Patch(":id/calculation-mode") async switchCalculationMode(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.switchCalculationMode(id, switchQuoteCalculationModeSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "quotes:write"); return { quote: await this.quotes.archive(id, user) };
  }
  @Get(":id/updates")
  async listUpdates(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("kind") kind = "all",
    @Query("cursor") cursor?: string,
    @Query("take") take?: string
  ) {
    const user = await this.auth.requireUser(request, "quotes:read");
    return listQuoteUpdates(id, requestUpdateFilterSchema.parse(kind), cursor, Number(take) || 25, user.id);
  }
  @Post(":id/updates")
  async postUpdate(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["quotes:read", "activity:write"] });
    return createQuoteUpdate(id, createRequestUpdateSchema.parse(body), user);
  }
  @Post(":id/updates/:updateId/complete")
  @HttpCode(200)
  async completeUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, { allOf: ["quotes:read", "activity:write"] });
    const payload = requestUpdateCompleteSchema.parse(body ?? {});
    return payload.completed === false
      ? undoQuoteUpdate(id, updateId, user)
      : completeQuoteUpdate(id, updateId, user);
  }
  @Post(":id/updates/:updateId/undo")
  @HttpCode(200)
  async undoUpdate(@Req() request: Request, @Param("id") id: string, @Param("updateId") updateId: string) {
    const user = await this.auth.requireUser(request, { allOf: ["quotes:read", "activity:write"] });
    return undoQuoteUpdate(id, updateId, user);
  }
  @Post(":id/mentions/read")
  @HttpCode(200)
  async readMentions(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "quotes:read");
    return markQuoteMentionsRead(id, user.id);
  }
  @Post(":id/convert")
  @HttpCode(200)
  async convert(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["quotes:write", "projects:write"] });
    return { project: await this.quotes.convert(id, convertQuoteSchema.parse(body), user) };
  }
  @Post(":id/revisions")
  async createRevision(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.createRevision(id, createQuoteRevisionSchema.parse(body), user) };
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
    const user = await this.auth.requireUser(request, "quotes:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("quote", id, file, category, user, tags) };
  }
}
