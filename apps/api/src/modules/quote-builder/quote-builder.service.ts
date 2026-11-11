import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { BUILDER_SCHEMA_VERSION, readBuilderWorkspace, builderCalculationInput, builderWorkspaceSchema, emptyBuilderWorkspace, type BuilderSaveResponse, type SaveBuilderInput } from "@pulse/contracts/quote-builder";
import { quoteCommercialContentLocked } from "@pulse/contracts/quote-lifecycle";
import { calculateQuote } from "@pulse/quote-calculator";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PRISMA_CLIENT } from "@/shared/prisma.module";
import { CalculationConfigService } from "./calculation-config.service";

/** Editable, non-authoritative working inputs. Never writes Quote financial/lifecycle records. */
@Injectable()
export class QuoteBuilderService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient, @Inject(CalculationConfigService) private readonly config: CalculationConfigService) {}

  private async quote(db: Prisma.TransactionClient | PrismaClient, id: string, write = false) {
    const quote = await db.quote.findUnique({ where: { id }, select: { id: true, status: true, sentAt: true, archivedAt: true, calculationMode: true } });
    if (!quote || quote.archivedAt) throw new NotFoundException("Quote not found.");
    if (write && quoteCommercialContentLocked(quote)) throw new ForbiddenException("The existing Quote policy does not permit financial edits.");
    if (write && quote.calculationMode !== "PULSE") throw new ConflictException("Builder editing requires Pulse mode.");
    return quote;
  }

  async load(quoteId: string) {
    await this.quote(this.db, quoteId);
    const [saved, configuration] = await Promise.all([
      this.db.quoteBuilderWorkspace.findUnique({ where: { quoteId } }), this.config.read()
    ]);
    if (saved && ![1, BUILDER_SCHEMA_VERSION].includes(saved.schemaVersion)) throw new ConflictException("This Builder document needs a newer application version.");
    const state = saved ? readBuilderWorkspace(saved.state, saved.schemaVersion) : emptyBuilderWorkspace();
    const itemIds = [...new Set(state.lines.flatMap(line => line.itemId ? [line.itemId] : []))];
    const activeItems = itemIds.length ? await this.db.item.findMany({ where: { id: { in: itemIds }, status: "ACTIVE" }, select: { id: true } }) : [];
    const activeIds = new Set(activeItems.map(item => item.id));
    return { state, writeToken: saved?.writeToken ?? null, ...configuration, unavailableItemIds: itemIds.filter(id => !activeIds.has(id)), calculation: calculateQuote(builderCalculationInput(state, configuration.configuration)) };
  }

  async save(quoteId: string, input: SaveBuilderInput): Promise<BuilderSaveResponse> {
    return this.db.$transaction(async tx => {
      // Coordinate with existing host mutations without modifying the parent Quote.
      await tx.$queryRaw`SELECT "id" FROM "pulse"."Quote" WHERE "id" = ${quoteId} FOR UPDATE`;
      await this.quote(tx, quoteId, true);
      const current = await tx.quoteBuilderWorkspace.findUnique({ where: { quoteId } });
      if ((current?.writeToken ?? null) !== input.expectedWriteToken) throw new ConflictException({ code: "BUILDER_WRITE_CONFLICT", error: "Builder inputs changed in another session. Your local edits are retained; reload before replacing them." });
      if (current && ![1, BUILDER_SCHEMA_VERSION].includes(current.schemaVersion)) throw new ConflictException("This Builder document needs a newer application version.");
      // Existing BOM documents retain their own editor. Do not reinterpret or replace them.
      if (!current && await tx.quoteItem.count({ where: { quoteId } }) > 0) throw new ConflictException("This quote uses the existing BOM editor. Automatic conversion is not supported.");
      const previous = new Map(current ? readBuilderWorkspace(current.state, current.schemaVersion).lines.map(line => [line.id, line.itemId]) : []);
      const newItemIds = [...new Set(input.state.lines.flatMap(line => line.itemId && previous.get(line.id) !== line.itemId ? [line.itemId] : []))];
      if (newItemIds.length) {
        const items = await tx.item.findMany({ where: { id: { in: newItemIds }, status: "ACTIVE" }, select: { id: true } });
        if (items.length !== newItemIds.length) throw new BadRequestException("A newly selected Item is inactive or unavailable. Remove it or use a Custom Line.");
      }
      const saved = current
        ? await tx.quoteBuilderWorkspace.update({ where: { quoteId }, data: { schemaVersion: BUILDER_SCHEMA_VERSION, state: input.state as Prisma.InputJsonValue, writeToken: { increment: 1 } } })
        : await tx.quoteBuilderWorkspace.create({ data: { quoteId, schemaVersion: BUILDER_SCHEMA_VERSION, state: input.state as Prisma.InputJsonValue } });
      // Do not return a fresh configuration or reprice the estimator's open session on save.
      return { state: builderWorkspaceSchema.parse(saved.state), writeToken: saved.writeToken };
    });
  }

  async calculate(quoteId: string, state: SaveBuilderInput["state"], configurationId: string) {
    await this.quote(this.db, quoteId);
    const current = await this.config.read();
    if (current.configurationId !== configurationId) throw new ConflictException({ code: "BUILDER_CONFIGURATION_CHANGED", error: "Company calculation settings changed. This session keeps its loaded rates. Reload the workspace explicitly to use current settings." });
    return { calculation: calculateQuote(builderCalculationInput(state, current.configuration)), configurationId };
  }
}
