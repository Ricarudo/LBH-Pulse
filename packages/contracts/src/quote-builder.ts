import { z } from "zod";

/** Editable Builder inputs only. These contracts carry no Quote lifecycle meaning. */
export const decimalInput = z.string().regex(/^-?\d{1,12}(\.\d{1,12})?$/, "Enter a decimal number.").nullable();
const id = z.string().min(1).max(120);
const text = z.string().max(2000);
const nonnegative = decimalInput.refine(v => v === null || Number(v) >= 0, "Must be zero or greater.");
const fraction = nonnegative.refine(v => v === null || Number(v) <= 1, "Enter a fraction between 0 and 1.");
const margin = fraction.refine(v => v === null || Number(v) < 1, "Target margin must be below 100%.");
export const builderModes = ["MATERIAL_AND_LABOR", "MATERIAL_ONLY", "LABOR_ONLY"] as const;
export type BuilderMode = typeof builderModes[number];
export const materialInputsSchema = z.object({
  baseUnitCost: decimalInput,
  contingency: decimalInput,
  freight: decimalInput,
  margin: decimalInput,
  materialIvuEnabled: z.boolean(),
  materialIvuRate: decimalInput
}).strict();
export const laborInputsSchema = z.object({
  laborClassId: id.nullable(),
  /** Quantity units completed by the configured crew per ideal working hour. */
  productionRate: decimalInput,
  crewSize: decimalInput,
  overtimeMultiplier: decimalInput
}).strict();
export const financialLineSchema = z.object({
  id, quantity: decimalInput, mode: z.enum(builderModes),
  material: materialInputsSchema, labor: laborInputsSchema
}).strict();
const builderLineV1Schema = financialLineSchema.extend({
  itemId: id.nullable(), name: z.string().max(200), unit: z.string().max(40),
  proposalDescription: text, imageUrl: z.string().max(2048).nullable(),
  groupId: id.nullable(), order: z.number().int().nonnegative(),
  origins: z.record(z.string().max(80), z.enum(["item", "company", "manual", "bulk"]))
}).strict();
/** Copied catalog facts. Name, unit, description and image remain editable line fields.
 * Null means a Custom Line or a v1 document whose additional catalog facts were never copied.
 * Never hydrate missing facts from today's catalog while reopening an estimate. */
export const builderItemFactsSchema = z.object({
  itemType: z.enum(["PRODUCT", "LABOR", "SERVICE"]),
  sku: z.string().max(120), partNumber: z.string().max(120),
  manufacturer: z.string().max(160), brand: z.string().max(160),
  category: z.string().max(120), subcategory: z.string().max(120),
  productUrl: z.string().max(2048), datasheetUrl: z.string().max(2048)
}).strict();
export const builderLineSchema = builderLineV1Schema.extend({ itemFacts: builderItemFactsSchema.nullable() }).strict();
export const BUILDER_SCHEMA_VERSION = 2 as const;
/** Stable identity of the editable starting company labor class. Rates always come from configuration. */
export const STANDARD_LABOR_CLASS_ID = "standard";
export const projectCostsSchema = z.object({
  travelTotal: decimalInput, equipmentRentalTotal: decimalInput,
  lodgingNightlyRate: decimalInput,
  lodgingHeadcountOverride: decimalInput
}).strict();
const workspaceShape = {
  groups: z.array(z.object({
    id, title: z.string().min(1).max(120), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    order: z.number().int().nonnegative()
  }).strict()).max(200),
  projectCosts: projectCostsSchema
};
export const builderWorkspaceSchema = z.object({
  ...workspaceShape, schemaVersion: z.literal(BUILDER_SCHEMA_VERSION), lines: z.array(builderLineSchema).max(5000)
}).strict().superRefine((value, context) => {
  for (const key of ["groups", "lines"] as const) {
    if (new Set(value[key].map(row => row.id)).size !== value[key].length) {
      context.addIssue({ code: "custom", path: [key], message: "Identifiers must be unique." });
    }
  }
  const groups = new Set(value.groups.map(group => group.id));
  value.lines.forEach((line, index) => {
    if (line.groupId && !groups.has(line.groupId)) context.addIssue({ code: "custom", path: ["lines", index, "groupId"], message: "Group not found." });
    if (line.quantity && !/^-?\d+(\.\d{1,3})?$/.test(line.quantity)) context.addIssue({ code: "custom", path: ["lines", index, "quantity"], message: "Quantity supports up to three decimal places." });
  });
});
const builderWorkspaceV1Schema = z.object({ ...workspaceShape, lines: z.array(builderLineV1Schema).max(5000) }).strict();
/** Read-only upgrade. The next explicit working-state save stores v2 under the same write token policy. */
export function readBuilderWorkspace(value: unknown, schemaVersion: number): BuilderWorkspace {
  if (schemaVersion === 2) return builderWorkspaceSchema.parse(value);
  if (schemaVersion !== 1) throw new Error("Unsupported Builder document version.");
  const previous = builderWorkspaceV1Schema.parse(value);
  return builderWorkspaceSchema.parse({ ...previous, schemaVersion: 2, lines: previous.lines.map(line => ({ ...line, itemFacts: null })) });
}

export const laborClassSchema = z.object({
  id, name: z.string().trim().min(1).max(100), hourlyRate: nonnegative.refine(value => value === null || (value.split(".")[1]?.length ?? 0) <= 8, "Hourly rates support up to eight decimal places."), enabled: z.boolean()
}).strict();
export const calculationSettingsSchema = z.object({
  overtimeMultiplier: nonnegative.refine(v => v === null || Number(v) > 0, "Multiplier must be positive."),
  practicalTimelineFactor: nonnegative.refine(v => v === null || Number(v) > 0, "Factor must be positive."),
  materialIvuRate: fraction, b2bServiceTaxRate: fraction,
  payrollBurden: nonnegative, laborContingency: nonnegative, laborMargin: margin, fondo: nonnegative,
  materialMargin: margin, materialFreight: nonnegative, materialContingency: nonnegative,
  vehicleWeeklyCost: nonnegative, annualRent: nonnegative, annualBondInsurance: nonnegative,
  indirectRoles: z.array(z.object({
    id, name: z.string().trim().min(1).max(100), enabled: z.boolean(),
    weeklyCost: nonnegative, allocationPercent: fraction
  }).strict()).max(100).nullable()
}).strict();
export const calculationConfigurationSchema = calculationSettingsSchema.extend({
  laborClasses: z.array(laborClassSchema).max(200)
}).superRefine((value, ctx) => {
  for (const key of ["laborClasses", "indirectRoles"] as const) {
    const rows = value[key] ?? [];
    if (new Set(rows.map(row => row.id)).size !== rows.length) ctx.addIssue({ code: "custom", path: [key], message: "Identifiers must be unique." });
  }
});
export const saveBuilderSchema = z.object({
  expectedWriteToken: z.number().int().nonnegative().nullable(), state: builderWorkspaceSchema
}).strict();
export const calculateBuilderSchema = z.object({
  state: builderWorkspaceSchema, configurationId: z.string().min(1).max(100)
}).strict();
export const saveCalculationSettingsSchema = z.object({
  expectedConfigurationId: z.string().min(1).max(100), settings: calculationSettingsSchema
}).strict();
export const saveLaborClassSchema = laborClassSchema.omit({ id: true });

export type BuilderLine = z.infer<typeof builderLineSchema>;
export type FinancialLine = z.infer<typeof financialLineSchema>;
export type BuilderWorkspace = z.infer<typeof builderWorkspaceSchema>;
export type ProjectCosts = z.infer<typeof projectCostsSchema>;
export type CalculationSettings = z.infer<typeof calculationSettingsSchema>;
export type CalculationConfiguration = z.infer<typeof calculationConfigurationSchema>;
export type LaborClass = z.infer<typeof laborClassSchema>;
export type SaveBuilderInput = z.infer<typeof saveBuilderSchema>;
export type CalculationInput = { lines: FinancialLine[]; projectCosts: ProjectCosts; configuration: CalculationConfiguration };
export type Metric = string | null;
export type CalculationDiagnostic = {
  code: string; category: "incomplete" | "invalid"; path: string; lineId?: string; message: string;
};
export type MaterialResult = {
  baseCost: string; contingency: string; freight: string; materialIvuAmount: string; profit: string;
  rawUnit: string; customerUnit: string; rawTotal: string; customerTotal: string; roundingDifference: string;
};
export type LineLaborResult = {
  installationHours: Metric; directHours: Metric; effectiveHourlyRate: Metric; directCost: Metric;
  rawUnit: Metric; customerUnit: Metric; rawTotal: Metric; customerTotal: Metric; roundingDifference: Metric;
};
export type LineCalculation = { id: string; material: MaterialResult | null; labor: LineLaborResult | null; customerUnit: Metric; customerTotal: Metric };
export type LaborAnalysis = {
  directHours: Metric; directCost: Metric; effectiveCrewSize: Metric; contributorCount: number;
  idealHours: Metric; practicalHours: Metric; practicalDays: Metric; practicalWeeks: Metric;
  supervisionRoles: Array<{ id: string; name: string; cost: Metric }>;
  supervision: Metric; payrollBurden: Metric; contingency: Metric; payrollSubtotal: Metric;
  vehicles: Metric; equipmentRental: Metric; preMarginCost: Metric; profit: Metric; postMarginAmount: Metric;
  rent: Metric; bondInsurance: Metric; lodgingHeadcount: Metric; lodgingNights: Metric; lodging: Metric;
  travel: Metric; fondo: Metric; loadedTotal: Metric; allocationFactor: Metric;
  rawSellingTotal: Metric; customerTotal: Metric; roundingDifference: Metric;
  preciseLaborSellingTarget: Metric; rawAllocatedLaborValue: Metric; roundedCustomerLaborValue: Metric;
  laborAllocationRoundingDelta: Metric; allocationPrecisionDelta: Metric;
};
export type CalculationResult = {
  status: "complete" | "incomplete" | "invalid"; diagnostics: CalculationDiagnostic[];
  lines: LineCalculation[]; labor: LaborAnalysis;
  material: Omit<MaterialResult, "rawUnit" | "customerUnit"> | null;
  projectCosts: {
    entered: ProjectCosts; enteredCostTotal: Metric; knownEnteredCostTotal: string;
    allocatedCostTotal: Metric; unallocatedCostTotal: Metric;
    unallocatedLoadedSellingValue: Metric; allocationStatus: "allocated" | "unallocated" | "incomplete";
    incurredProjectCosts: Metric; recoveredProjectCosts: Metric; unrecoveredProjectCosts: Metric;
    unresolvedCosts: Array<"travel" | "equipmentRental" | "lodging">;
  };
  tax: { materialIvuAmount: Metric; b2bTaxableBase: Metric; b2bServiceTaxRate: Metric; b2bServiceTaxAmount: Metric;
    roundedCustomerLaborValue: Metric; rawMaterialContingency: Metric; rawMaterialProfit: Metric };
  totals: { rawFinalCustomerTotal: Metric; finalPayableTotal: Metric; payableRoundingAdjustment: Metric };
};
export type BuilderConfigurationResponse = { configuration: CalculationConfiguration; configurationId: string };
export type BuilderLoadResponse = BuilderConfigurationResponse & {
  state: BuilderWorkspace; writeToken: number | null; calculation: CalculationResult; unavailableItemIds: string[];
};
export type BuilderSaveResponse = { state: BuilderWorkspace; writeToken: number };

export function emptyBuilderWorkspace(): BuilderWorkspace {
  return { schemaVersion: BUILDER_SCHEMA_VERSION, groups: [], lines: [], projectCosts: { travelTotal: "0", equipmentRentalTotal: "0", lodgingNightlyRate: "0", lodgingHeadcountOverride: null } };
}

/** Strip all presentation metadata before entering the financial engine. */
export function builderCalculationInput(state: BuilderWorkspace, configuration: CalculationConfiguration): CalculationInput {
  return { configuration, projectCosts: state.projectCosts, lines: state.lines.map(({ id, quantity, mode, material, labor }) => ({ id, quantity, mode, material, labor })) };
}
