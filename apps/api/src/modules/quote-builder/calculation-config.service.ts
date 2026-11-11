import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { calculationConfigurationSchema, calculationSettingsSchema, type BuilderConfigurationResponse, type CalculationConfiguration, type CalculationSettings, type LaborClass } from "@pulse/contracts/quote-builder";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PRISMA_CLIENT } from "@/shared/prisma.module";
import { initialCalculationSettings } from "./calculation-settings";

type Reader = Pick<Prisma.TransactionClient, "workspaceSettings" | "quoteLaborClass">;
export function configurationIdentifier(configuration: CalculationConfiguration): string {
  // Validate first, then normalize every decimal without binary floating-point conversion.
  // Labels/IDs stay literal even when they happen to look numeric. Null differs from zero.
  const validated = calculationConfigurationSchema.parse(configuration);
  const decimal = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const integer = whole.replace(/^0+(?=\d)/, "");
    const tail = fraction.replace(/0+$/, "");
    const normalized = integer + (tail ? `.${tail}` : "");
    return negative && normalized !== "0" ? `-${normalized}` : normalized;
  };
  const canonical = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(row => canonical(row));
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([field, entry]) => [field, canonical(entry, field)]));
    if (typeof value === "string" && key !== "id" && key !== "name") return decimal(value);
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonical(validated))).digest("hex");
}

@Injectable()
export class CalculationConfigService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient) {}

  async readFrom(db: Reader): Promise<BuilderConfigurationResponse> {
    const [workspace, classes] = await Promise.all([
      db.workspaceSettings.findUnique({ where: { id: "default" }, select: { quoteCalculationSettings: true } }),
      db.quoteLaborClass.findMany({ orderBy: { id: "asc" } })
    ]);
    const configuration = calculationConfigurationSchema.parse({
      ...calculationSettingsSchema.parse(workspace?.quoteCalculationSettings ?? initialCalculationSettings),
      laborClasses: classes.map(role => ({ id: role.id, name: role.name, enabled: role.enabled, hourlyRate: role.hourlyRate?.toFixed() ?? null }))
    });
    return { configuration, configurationId: configurationIdentifier(configuration) };
  }

  read() {
    return this.db.$transaction(tx => this.readFrom(tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async saveSettings(settings: CalculationSettings, expectedConfigurationId: string) {
    return this.db.$transaction(async tx => {
      // Serialize current-settings writes only. There is no retained configuration history.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(17364012)`;
      const current = await this.readFrom(tx);
      if (current.configurationId !== expectedConfigurationId) throw new ConflictException({ code: "BUILDER_CONFIGURATION_CHANGED", error: "Company calculation settings changed. Reload before saving settings." });
      await tx.workspaceSettings.upsert({
        where: { id: "default" }, create: { id: "default", quoteCalculationSettings: settings as Prisma.InputJsonValue },
        update: { quoteCalculationSettings: settings as Prisma.InputJsonValue }
      });
      return this.readFrom(tx);
    });
  }

  async saveClass(input: Omit<LaborClass, "id">, id?: string) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(17364012)`;
      if (id) {
        const current = await tx.quoteLaborClass.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Labor class not found.");
        await tx.quoteLaborClass.update({ where: { id }, data: input });
      } else await tx.quoteLaborClass.create({ data: input });
      return this.readFrom(tx);
    });
  }
}
