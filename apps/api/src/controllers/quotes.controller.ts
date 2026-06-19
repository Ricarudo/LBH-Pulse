import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import { archiveQuote, convertQuoteToProject, createQuote, getQuoteById, listQuotes, updateQuote } from "@/lib/services/workService";
import { convertQuoteSchema, createQuoteSchema, updateQuoteSchema } from "@/lib/validations/work";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";

const uploadDirectory = process.env.DOCUMENT_TEMP_DIR || "/tmp/pulse-uploads";
mkdirSync(uploadDirectory, { recursive: true });

@Controller("quotes")
export class QuotesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get() async list(@Req() request: Request) { await this.auth.requireUser(request, "crm:read"); return { quotes: await listQuotes() }; }
  @Post() async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { quote: await createQuote(createQuoteSchema.parse(body), user) };
  }
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "crm:read"); return { quote: await getQuoteById(id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { quote: await updateQuote(id, updateQuoteSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "crm:write"); return { quote: await archiveQuote(id, user) };
  }
  @Post(":id/convert") async convert(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "crm:write");
    return { project: await convertQuoteToProject(id, convertQuoteSchema.parse(body), user) };
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
    const user = await this.auth.requireUser(request, "crm:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("quote", id, file, category, user) };
  }
}
