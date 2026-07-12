import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request } from "express";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { diskStorage } from "multer";
import { convertQuoteSchema, createQuoteSchema, updateQuoteSchema } from "@pulse/contracts/work";
import { AuthService } from "@/shared/auth.service";
import { uploadDocument } from "@/lib/services/documentService";
import { QuotesService } from "@/modules/quotes/quotes.service";

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
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "quotes:read"); return { quote: await this.quotes.get(id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "quotes:write");
    return { quote: await this.quotes.update(id, updateQuoteSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "quotes:write"); return { quote: await this.quotes.archive(id, user) };
  }
  @Post(":id/convert")
  @HttpCode(200)
  async convert(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, { allOf: ["quotes:write", "projects:write"] });
    return { project: await this.quotes.convert(id, convertQuoteSchema.parse(body), user) };
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
    const user = await this.auth.requireUser(request, "quotes:write").catch(async (error) => {
      if (file) await unlink(file.path).catch(() => undefined);
      throw error;
    });
    return { document: await uploadDocument("quote", id, file, category, user) };
  }
}
