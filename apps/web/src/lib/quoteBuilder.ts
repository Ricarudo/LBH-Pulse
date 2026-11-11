import type { ItemRecord } from "@pulse/contracts/items";
import type { BuilderLine, BuilderMode, BuilderWorkspace, CalculationConfiguration, CalculationResult, Metric } from "@pulse/contracts/quote-builder";
import { STANDARD_LABOR_CLASS_ID } from "@pulse/contracts/quote-builder";
import { sumCalculatedValues } from "@pulse/quote-calculator";

export const modeLabels: Record<BuilderMode, string> = { MATERIAL_AND_LABOR: "Material + Labor", MATERIAL_ONLY: "Material Only", LABOR_ONLY: "Labor Only" };
// Item APIs use numbers; serialize their supported precision without scientific notation.
const itemDecimal = (value: number | null | undefined): Metric => value == null ? null : value.toFixed(8).replace(/\.?0+$/, "");
export function createBuilderLine(id: string, configuration: CalculationConfiguration, order: number, item?: ItemRecord, groupId: string | null = null): BuilderLine {
  if (item?.status === "INACTIVE") throw new Error("This Item is inactive. Choose an active Item.");
  const standardClass = configuration.laborClasses.find(role => role.id === STANDARD_LABOR_CLASS_ID && role.enabled);
  const laborClassId = item?.defaultLaborClassId ?? standardClass?.id ?? null;
  return {
    itemFacts: item ? { itemType: item.itemType, sku: item.sku ?? "", partNumber: item.partNumber ?? "", manufacturer: item.manufacturer ?? "", brand: item.brand ?? "", category: item.category ?? "", subcategory: item.subcategory ?? "", productUrl: item.productUrl ?? "", datasheetUrl: item.datasheetUrl ?? "" } : null,
    id, itemId: item?.id ?? null, name: item?.name ?? "Custom line", unit: item?.unitOfMeasure || "each",
    proposalDescription: item?.quoteDescription || item?.description || "", imageUrl: item?.primaryImageUrl || null,
    groupId, order, quantity: "0", mode: item && item.itemType !== "PRODUCT" ? "LABOR_ONLY" : "MATERIAL_AND_LABOR",
    material: { baseUnitCost: itemDecimal(item?.cost), contingency: configuration.materialContingency, freight: configuration.materialFreight, margin: configuration.materialMargin, materialIvuEnabled: item?.taxable ?? true, materialIvuRate: configuration.materialIvuRate },
    labor: { laborClassId, productionRate: itemDecimal(item?.defaultProductionRate), crewSize: itemDecimal(item?.defaultCrewSize), overtimeMultiplier: configuration.overtimeMultiplier },
    origins: { "name": item ? "item" : "manual", "proposalDescription": item ? "item" : "manual", "imageUrl": item ? "item" : "manual", "unit": item ? "item" : "manual", "material.materialIvuEnabled": item ? "item" : "manual", "material.baseUnitCost": item ? "item" : "manual", "material.contingency": "company", "material.freight": "company", "material.margin": "company", "material.materialIvuRate": "company", "labor.productionRate": item ? "item" : "manual", "labor.crewSize": item ? "item" : "manual", "labor.laborClassId": item?.defaultLaborClassId ? "item" : standardClass ? "company" : "manual", "labor.overtimeMultiplier": "company" }
  };
}

/** Explicit catalog action only. Preserves quantity, mode, organization and customer wording.
 * Optional kit expansion belongs in a future selection adapter returning ordinary lines,
 * never in calculateQuote or a catalog-bound effect. */
export function reapplyItemEstimatingDefaults(line: BuilderLine, item: ItemRecord): BuilderLine {
  if (item.id !== line.itemId || item.status !== "ACTIVE") throw new Error("The selected Item is inactive or unavailable.");
  return { ...line,
    material: { ...line.material, baseUnitCost: itemDecimal(item.cost), materialIvuEnabled: item.taxable },
    labor: { ...line.labor, productionRate: itemDecimal(item.defaultProductionRate), crewSize: itemDecimal(item.defaultCrewSize), laborClassId: item.defaultLaborClassId ?? null },
    origins: { ...line.origins, ...Object.fromEntries(["material.baseUnitCost", "material.materialIvuEnabled", "labor.productionRate", "labor.crewSize", "labor.laborClassId"].map(key => [key, "item" as const])) }
  };
}

export function itemIdentityText(facts: BuilderLine["itemFacts"]): string {
  return facts ? [facts.manufacturer || facts.brand, facts.partNumber || facts.sku].filter(Boolean).join(" · ") : "";
}

export const bulkFields = {
  "material.baseUnitCost": "Material unit cost", "material.freight": "Freight", "material.contingency": "Material contingency",
  "material.margin": "Material target margin", "labor.laborClassId": "Labor class", "labor.productionRate": "Production rate", "labor.crewSize": "Crew size"
} as const;
export type BulkField = keyof typeof bulkFields;
export function applyBuilderBulk(state: BuilderWorkspace, targets: Set<string> | null, field: BulkField, value: Metric): { state: BuilderWorkspace; affected: number; skipped: number } {
  let affected = 0; let skipped = 0;
  const [area, key] = field.split(".") as ["material" | "labor", string];
  const lines = state.lines.map(line => {
    if (targets && !targets.has(line.id)) return line;
    if ((area === "material" && line.mode === "LABOR_ONLY") || (area === "labor" && line.mode === "MATERIAL_ONLY")) { skipped++; return line; }
    affected++;
    return { ...line, [area]: { ...line[area], [key]: value }, origins: { ...line.origins, [field]: "bulk" as const } };
  });
  return { state: { ...state, lines }, affected, skipped };
}

// Unit conversion for input/display only. No pricing or tax formulas live in React.
export function percentText(fraction: Metric): string {
  if (fraction === null) return "";
  const negative = fraction.startsWith("-");
  const [whole, decimal = ""] = fraction.replace(/^-/, "").split(".");
  return `${negative ? "-" : ""}${Number(whole + decimal.padEnd(2, "0").slice(0, 2))}${decimal.length > 2 ? `.${decimal.slice(2)}` : ""}`;
}
export function fractionText(percent: string): Metric {
  if (!percent.trim()) return null;
  const negative = percent.startsWith("-");
  const [whole, decimal = ""] = percent.replace(/^-/, "").split(".");
  const digits = whole.padStart(3, "0");
  return `${negative ? "-" : ""}${Number(digits.slice(0, -2))}.${digits.slice(-2)}${decimal}`;
}

/** A future proposal consumes this view, never recalculates prices. Group sums are presentation only. */
export function builderPresentation(state: BuilderWorkspace, result: CalculationResult) {
  const results = new Map(result.lines.map(line => [line.id, line]));
  return [...state.groups.slice().sort((a, b) => a.order - b.order), { id: null, title: "Ungrouped", accent: null, order: Infinity }].map(group => {
    const lines = state.lines.filter(line => line.groupId === group.id).sort((a, b) => a.order - b.order).map(line => ({ ...line, calculation: results.get(line.id)! }));
    return { ...group, lines, materialTotal: sumCalculatedValues(lines.map(line => line.mode === "LABOR_ONLY" ? "0" : line.calculation.material?.customerTotal ?? null)), laborTotal: sumCalculatedValues(lines.map(line => line.mode === "MATERIAL_ONLY" ? "0" : line.calculation.labor?.customerTotal ?? null)), total: sumCalculatedValues(lines.map(line => line.calculation.customerTotal)) };
  });
}
