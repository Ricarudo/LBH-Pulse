import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { archiveInvoice, createInvoice, getInvoiceById, listInvoices, updateInvoice } from "@/lib/services/workService";
import { createInvoiceSchema, updateInvoiceSchema } from "@pulse/contracts/work";
import { AuthService } from "@/shared/auth.service";

@Controller("invoices")
export class InvoicesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get() async list(@Req() request: Request) { await this.auth.requireUser(request, "billing:read"); return { invoices: await listInvoices() }; }
  @Post() async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "billing:write");
    return { invoice: await createInvoice(createInvoiceSchema.parse(body), user) };
  }
  @Get(":id") async get(@Req() request: Request, @Param("id") id: string) {
    await this.auth.requireUser(request, "billing:read"); return { invoice: await getInvoiceById(id) };
  }
  @Patch(":id") async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const user = await this.auth.requireUser(request, "billing:write");
    return { invoice: await updateInvoice(id, updateInvoiceSchema.parse(body), user) };
  }
  @Delete(":id") async archive(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "billing:write"); return { invoice: await archiveInvoice(id, user) };
  }
}
