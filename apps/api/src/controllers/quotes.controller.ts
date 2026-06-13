import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { archiveQuote, convertQuoteToProject, createQuote, getQuoteById, listQuotes, updateQuote } from "@/lib/services/workService";
import { convertQuoteSchema, createQuoteSchema, updateQuoteSchema } from "@/lib/validations/work";
import { AuthService } from "@/shared/auth.service";

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
}

