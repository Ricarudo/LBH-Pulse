import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req
} from "@nestjs/common";
import {
  createItemSchema,
  itemSearchSchema,
  updateItemSchema,
  type ItemResponse,
  type ItemsResponse
} from "@pulse/contracts/items";
import type { Request } from "express";
import { ItemsService } from "@/items/items.service";
import { AuthService } from "@/shared/auth.service";

type QueryInput = Record<string, string | string[] | undefined>;

@Controller("items")
export class ItemsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ItemsService) private readonly items: ItemsService
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: QueryInput
  ): Promise<ItemsResponse> {
    await this.auth.requireUser(request, "crm:read");
    const input = itemSearchSchema.parse(query);
    return { items: await this.items.listItems(input) };
  }

  @Get("search")
  async search(
    @Req() request: Request,
    @Query() query: QueryInput
  ): Promise<ItemsResponse> {
    await this.auth.requireUser(request, "crm:read");
    const input = itemSearchSchema.parse(query);
    return { items: await this.items.searchActiveItems(input) };
  }

  @Post()
  async create(
    @Req() request: Request,
    @Body() body: unknown
  ): Promise<ItemResponse> {
    await this.auth.requireUser(request, "crm:write");
    const input = createItemSchema.parse(body);
    return { item: await this.items.createItem(input) };
  }

  @Get(":id")
  async get(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<ItemResponse> {
    await this.auth.requireUser(request, "crm:read");
    return { item: await this.items.getItemById(id) };
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<ItemResponse> {
    await this.auth.requireUser(request, "crm:write");
    const input = updateItemSchema.parse(body);
    return { item: await this.items.updateItem(id, input) };
  }

  @Delete(":id")
  async remove(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<ItemResponse> {
    await this.auth.requireUser(request, "crm:write");
    return { item: await this.items.markItemInactive(id) };
  }
}
