import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Patch,
  Post,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import {
  addAdHocQuoteItemSchema,
  addQuoteItemSchema,
  addQuoteKitSchema,
  reorderQuoteItemsSchema,
  updateQuoteItemSchema
} from "@pulse/contracts/items";
import { AuthService } from "@/shared/auth.service";
import { QuoteItemsService } from "@/modules/quote-items/quote-items.service";

@Controller("quotes/:quoteId/items")
export class QuoteItemsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(QuoteItemsService) private readonly quoteItems: QuoteItemsService
  ) {}

  @Post()
  async add(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    const input = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};
    const { mode, ...payload } = input;
    const quote = mode === "adHoc"
      ? await this.quoteItems.addAdHoc(
          quoteId,
          addAdHocQuoteItemSchema.parse(payload),
          user
        )
      : await this.quoteItems.addCatalog(
          quoteId,
          addQuoteItemSchema.parse(payload),
          user
        );
    return { quote };
  }

  @Post("kit")
  async addKit(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    return {
      quote: await this.quoteItems.addKit(
        quoteId,
        addQuoteKitSchema.parse(body),
        user
      )
    };
  }

  @Patch("reorder")
  async reorder(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    return {
      quote: await this.quoteItems.reorder(
        quoteId,
        reorderQuoteItemsSchema.parse(body),
        user
      )
    };
  }

  @Patch(":quoteItemId")
  async update(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Param("quoteItemId") quoteItemId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    return {
      quote: await this.quoteItems.update(
        quoteId,
        quoteItemId,
        updateQuoteItemSchema.parse(body),
        user
      )
    };
  }

  @Delete(":quoteItemId")
  async remove(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Param("quoteItemId") quoteItemId: string
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    return {
      quote: await this.quoteItems.remove(quoteId, quoteItemId, user)
    };
  }
}
