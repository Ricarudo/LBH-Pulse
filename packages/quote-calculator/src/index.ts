import Decimal from "decimal.js-light";
import { calculateB2bTax, materialIvuUnit } from "./tax";
import type {
  CalculationConfiguration, CalculationDiagnostic, CalculationInput, CalculationResult,
  LaborAnalysis, LineCalculation, LineLaborResult, MaterialResult, Metric, ProjectCosts
} from "@pulse/contracts/quote-builder";

// Isolated arithmetic context: importing the engine never changes another module's precision.
const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Value = Decimal | null;
const d = (value: string | number) => new Money(value);
const zero = () => d(0);
const str = (value: Value): Metric => value?.toFixed() ?? null;
const add = (...values: Value[]): Value => values.some(value => value === null) ? null : values.reduce<Decimal>((sum, value) => sum.plus(value!), zero());
const multiply = (left: Value, right: Value): Value => left === null || right === null ? null : left.times(right);
const divide = (left: Value, right: Value): Value => left === null || right === null || right.isZero() ? null : left.div(right);
const ceilCent = (value: Value): Value => value?.toDecimalPlaces(2, Money.ROUND_CEIL) ?? null;
const ceil = (value: Value): Value => value?.toDecimalPlaces(0, Money.ROUND_CEIL) ?? null;
const from = (value: Metric): Value => value === null ? null : d(value);

class Inputs {
  diagnostics: CalculationDiagnostic[] = [];
  issue(code: string, category: "incomplete" | "invalid", path: string, message: string, lineId?: string) {
    this.diagnostics.push({ code, category, path, message, ...(lineId ? { lineId } : {}) });
  }
  read(value: Metric | undefined, path: string, options: { positive?: boolean; margin?: boolean; fraction?: boolean; integer?: boolean; lineId?: string } = {}): Value {
    if (value === null || value === undefined || value === "") {
      this.issue("INPUT_REQUIRED", "incomplete", path, "Not configured. Enter a value or explicitly configure zero where applicable.", options.lineId);
      return null;
    }
    let result: Decimal;
    try { result = d(value); } catch {
      this.issue("INVALID_NUMBER", "invalid", path, "Enter a valid decimal number.", options.lineId); return null;
    }
    if (result.isNegative() || (options.positive && result.isZero()) || (options.margin && result.gte(1)) || (options.fraction && result.gt(1)) || (options.integer && !result.isInteger())) {
      this.issue("INVALID_VALUE", "invalid", path, options.fraction ? "Fraction must be between zero and one." : options.margin ? "Target margin must be at least zero and below 100%." : options.positive ? "Value must be greater than zero." : options.integer ? "Enter a nonnegative whole number." : "Value cannot be negative.", options.lineId);
      return null;
    }
    return result;
  }
  percent(base: Value, value: Metric, path: string): Value {
    if (base?.isZero()) return zero(); // An unused configuration value is not an assumed zero rate.
    return multiply(base, this.read(value, path));
  }
}

const zeroMaterial = (): MaterialResult => ({ baseCost: "0", contingency: "0", freight: "0", materialIvuAmount: "0", profit: "0", rawUnit: "0", customerUnit: "0", rawTotal: "0", customerTotal: "0", roundingDifference: "0" });
const blankLineLabor = (): LineLaborResult => ({ installationHours: null, directHours: null, effectiveHourlyRate: null, directCost: null, rawUnit: null, customerUnit: null, rawTotal: null, customerTotal: null, roundingDifference: null });
const zeroLineLabor = (): LineLaborResult => Object.fromEntries(Object.keys(blankLineLabor()).map(key => [key, "0"])) as LineLaborResult;

/** Internal stage entry point also used by aggregate regression fixtures; no database or UI. */
export function calculateLaborStages(
  aggregate: { directHours: Metric; directCost: Metric; effectiveCrewSize: Metric; contributorCount: number },
  costs: ProjectCosts,
  config: CalculationConfiguration,
  inputs = new Inputs()
): { labor: LaborAnalysis; diagnostics: CalculationDiagnostic[]; rawProjectCost: Metric; knownProjectCost: string } {
  const direct = from(aggregate.directCost);
  const hours = from(aggregate.directHours);
  const crew = from(aggregate.effectiveCrewSize);
  const ideal = aggregate.contributorCount === 0 && hours?.isZero() ? zero() : divide(hours, crew);
  const practical = ideal?.isZero() ? zero() : multiply(ideal, inputs.read(config.practicalTimelineFactor, "configuration.practicalTimelineFactor", { positive: true }));
  const days = divide(practical, d(8));
  const weeks = divide(practical, d(40));
  const roles: LaborAnalysis["supervisionRoles"] = [];
  let supervision: Value = zero();
  if (weeks === null) supervision = null;
  else if (!weeks.isZero()) {
    if (config.indirectRoles === null) {
      inputs.issue("CONFIG_REQUIRED", "incomplete", "configuration.indirectRoles", "Configure indirect roles, or explicitly confirm that no indirect roles apply.");
      supervision = null;
    } else {
      for (const role of [...config.indirectRoles].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
        const cost = role.enabled ? multiply(multiply(weeks, inputs.read(role.weeklyCost, `configuration.indirectRoles.${role.id}.weeklyCost`)), inputs.read(role.allocationPercent, `configuration.indirectRoles.${role.id}.allocationPercent`, { fraction: true })) : zero();
        roles.push({ id: role.id, name: role.name, cost: str(cost) });
        supervision = add(supervision, cost);
      }
    }
  }
  const payrollBurden = inputs.percent(add(direct, supervision), config.payrollBurden, "configuration.payrollBurden");
  const contingency = inputs.percent(add(direct, supervision, payrollBurden), config.laborContingency, "configuration.laborContingency");
  const payroll = add(direct, supervision, payrollBurden, contingency);
  const durationCost = (value: Metric, path: string, annual = false): Value => weeks?.isZero() ? zero() : multiply(annual ? divide(inputs.read(value, path), d(52)) : inputs.read(value, path), weeks);
  const vehicles = durationCost(config.vehicleWeeklyCost, "configuration.vehicleWeeklyCost");
  const equipment = inputs.read(costs.equipmentRentalTotal, "projectCosts.equipmentRentalTotal");
  const travel = inputs.read(costs.travelTotal, "projectCosts.travelTotal");
  const preMargin = add(payroll, vehicles, equipment);
  const margin = preMargin?.isZero() ? zero() : inputs.read(config.laborMargin, "configuration.laborMargin", { margin: true });
  const postMargin = margin === null ? null : divide(preMargin, d(1).minus(margin));
  const profit = postMargin === null || preMargin === null ? null : postMargin.minus(preMargin);
  const rent = durationCost(config.annualRent, "configuration.annualRent", true);
  const bond = durationCost(config.annualBondInsurance, "configuration.annualBondInsurance", true);
  const lodgingRate = inputs.read(costs.lodgingNightlyRate, "projectCosts.lodgingNightlyRate");
  let headcount = costs.lodgingHeadcountOverride === null ? ceil(crew) : inputs.read(costs.lodgingHeadcountOverride, "projectCosts.lodgingHeadcountOverride", { integer: true });
  let nights = ceil(days);
  let lodging: Value = lodgingRate?.isZero() ? zero() : multiply(multiply(lodgingRate, headcount), nights);
  if (lodgingRate?.gt(0) && (days === null || days.isZero() || headcount === null)) {
    inputs.issue("LODGING_DURATION_REQUIRED", "incomplete", "projectCosts.lodgingNightlyRate", "Lodging inputs are saved, but a usable labor duration and headcount are needed to calculate lodging cost.");
    lodging = null;
    if (days?.isZero()) nights = null;
  }
  if (headcount === null && lodgingRate?.isZero() && aggregate.contributorCount === 0) headcount = zero();
  const fondo = inputs.percent(postMargin, config.fondo, "configuration.fondo");
  const loaded = add(postMargin, rent, bond, lodging, travel, fondo);
  const factor = direct?.gt(0) ? divide(loaded, direct) : null;
  if (direct?.isZero() && (loaded === null || loaded.gt(0))) {
    inputs.issue("NO_LABOR_ALLOCATION_BASE", "incomplete", "projectCosts", "Project costs are not included in customer pricing: there is no direct labor cost to allocate them against.");
  }
  return {
    diagnostics: inputs.diagnostics,
    rawProjectCost: str(add(equipment, travel, lodging)),
    knownProjectCost: str(add(...[equipment, travel, lodging].filter((value): value is Decimal => value !== null)))!,
    labor: {
      ...aggregate, idealHours: str(ideal), practicalHours: str(practical), practicalDays: str(days), practicalWeeks: str(weeks),
      supervisionRoles: roles, supervision: str(supervision), payrollBurden: str(payrollBurden), contingency: str(contingency),
      payrollSubtotal: str(payroll), vehicles: str(vehicles), equipmentRental: str(equipment), preMarginCost: str(preMargin),
      profit: str(profit), postMarginAmount: str(postMargin), rent: str(rent), bondInsurance: str(bond),
      lodgingHeadcount: str(headcount), lodgingNights: str(nights), lodging: str(lodging), travel: str(travel), fondo: str(fondo),
      preciseLaborSellingTarget: str(loaded), rawAllocatedLaborValue: null, roundedCustomerLaborValue: null, laborAllocationRoundingDelta: null, allocationPrecisionDelta: null,
      loadedTotal: str(loaded), allocationFactor: str(factor), rawSellingTotal: null, customerTotal: null, roundingDifference: null
    }
  };
}

/** Current Builder arithmetic only. All rates arrive through inputs; no financial side effects. */
export function calculateQuote(input: CalculationInput): CalculationResult {
  const inputs = new Inputs();
  const config = input.configuration;
  const lines: LineCalculation[] = [];
  const quantities = new Map<string, Value>();
  let hours: Value = zero();
  let directCost: Value = zero();
  let crewSum: Value = zero();
  let count = 0;
  let laborInputsComplete = true;
  const sorted = [...input.lines].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const seen = new Set<string>();
  for (const line of sorted) {
    if (seen.has(line.id)) inputs.issue("DUPLICATE_LINE", "invalid", "lines", "Line identifiers must be unique.", line.id);
    seen.add(line.id);
    const prefix = `lines.${line.id}`;
    const read = (value: Metric, field: string, options = {}) => inputs.read(value, `${prefix}.${field}`, { ...options, lineId: line.id });
    const quantity = read(line.quantity, "quantity");
    quantities.set(line.id, quantity);
    const hasMaterial = line.mode !== "LABOR_ONLY";
    const hasLabor = line.mode !== "MATERIAL_ONLY";
    const result: LineCalculation = { id: line.id, material: null, labor: hasLabor ? blankLineLabor() : null, customerUnit: null, customerTotal: null };
    lines.push(result);
    if (quantity?.isZero()) {
      result.material = hasMaterial ? zeroMaterial() : null;
      result.labor = hasLabor ? zeroLineLabor() : null;
      result.customerUnit = "0"; result.customerTotal = "0";
      continue;
    }
    if (hasMaterial) {
      const base = read(line.material.baseUnitCost, "material.baseUnitCost");
      const contingency = multiply(base, read(line.material.contingency, "material.contingency"));
      const freight = multiply(base, read(line.material.freight, "material.freight"));
      const ivu = materialIvuUnit(base, line.material.materialIvuEnabled ? read(line.material.materialIvuRate, "material.materialIvuRate", { fraction: true }) : null, line.material.materialIvuEnabled);
      const margin = read(line.material.margin, "material.margin", { margin: true });
      const profit = base === null || margin === null ? null : base.div(d(1).minus(margin)).minus(base);
      const raw = add(base, contingency, freight, ivu, profit);
      const customer = ceilCent(raw);
      if (quantity !== null && raw !== null && customer !== null) {
        result.material = {
          baseCost: str(multiply(base, quantity))!, contingency: str(multiply(contingency, quantity))!, freight: str(multiply(freight, quantity))!,
          materialIvuAmount: str(multiply(ivu, quantity))!, profit: str(multiply(profit, quantity))!,
          rawUnit: str(raw)!, customerUnit: str(customer)!, rawTotal: str(raw.times(quantity))!, customerTotal: str(customer.times(quantity))!,
          roundingDifference: str(customer.minus(raw).times(quantity))!
        };
      }
    }
    if (hasLabor) {
      const production = read(line.labor.productionRate, "labor.productionRate", { positive: true });
      const crew = read(line.labor.crewSize, "labor.crewSize", { positive: true });
      const installation = divide(quantity, production);
      const effort = multiply(installation, crew);
      const laborClass = config.laborClasses.find(role => role.id === line.labor.laborClassId);
      let rate: Value = null;
      if (!laborClass || !laborClass.enabled) {
        inputs.issue("LABOR_CLASS_UNAVAILABLE", "incomplete", `${prefix}.labor.laborClassId`, "Choose an active company labor class.", line.id);
      } else rate = inputs.read(laborClass.hourlyRate, `configuration.laborClasses.${laborClass.id}.hourlyRate`, { lineId: line.id });
      const effectiveRate = multiply(rate, read(line.labor.overtimeMultiplier, "labor.overtimeMultiplier", { positive: true }));
      const cost = multiply(effort, effectiveRate);
      Object.assign(result.labor!, { installationHours: str(installation), directHours: str(effort), effectiveHourlyRate: str(effectiveRate), directCost: str(cost) });
      hours = add(hours, effort);
      directCost = add(directCost, cost);
      if (effort?.gt(0) && crew !== null) { crewSum = add(crewSum, crew); count++; }
      else laborInputsComplete = false;
    }
  }
  const effectiveCrew = laborInputsComplete && count > 0 ? divide(crewSum, d(count)) : null;
  const stages = calculateLaborStages({ directHours: str(hours), directCost: str(directCost), effectiveCrewSize: str(effectiveCrew), contributorCount: count }, input.projectCosts, config, inputs);
  const labor = stages.labor;
  const factor = from(labor.allocationFactor);
  const zeroLaborSale = directCost?.isZero() && labor.loadedTotal === "0";
  for (const [index, result] of lines.entries()) {
    const quantity = quantities.get(result.id)!;
    if (result.labor && quantity?.gt(0)) {
      const rawTotal = factor === null ? zeroLaborSale ? zero() : null : multiply(from(result.labor.directCost), factor);
      const rawUnit = divide(rawTotal, quantity);
      const customerUnit = ceilCent(rawUnit);
      const customerTotal = multiply(customerUnit, quantity);
      Object.assign(result.labor, { rawTotal: str(rawTotal), rawUnit: str(rawUnit), customerUnit: str(customerUnit), customerTotal: str(customerTotal), roundingDifference: customerTotal === null || rawTotal === null ? null : str(customerTotal.minus(rawTotal)) });
    }
    const source = sorted[index];
    result.customerUnit = str(add(source.mode === "LABOR_ONLY" ? zero() : from(result.material?.customerUnit ?? null), source.mode === "MATERIAL_ONLY" ? zero() : from(result.labor?.customerUnit ?? null)));
    result.customerTotal = str(add(source.mode === "LABOR_ONLY" ? zero() : from(result.material?.customerTotal ?? null), source.mode === "MATERIAL_ONLY" ? zero() : from(result.labor?.customerTotal ?? null)));
  }
  const materialLines = lines.filter((_, index) => sorted[index].mode !== "LABOR_ONLY");
  const sumMaterial = (field: keyof MaterialResult) => add(...materialLines.map(line => from(line.material?.[field] ?? null)));
  const materialFields = ["baseCost", "contingency", "freight", "materialIvuAmount", "profit", "rawTotal", "customerTotal", "roundingDifference"] as const;
  const material = materialLines.some(line => line.material === null) ? null : Object.fromEntries(materialFields.map(key => [key, str(sumMaterial(key))!])) as NonNullable<CalculationResult["material"]>;
  const laborRows = lines.filter(line => line.labor !== null);
  const laborRaw = add(...laborRows.map(line => from(line.labor!.rawTotal)));
  let laborCustomer = add(...laborRows.map(line => from(line.labor!.customerTotal)));
  // Project costs cannot disappear merely because there are no labor rows to sum.
  if (directCost?.isZero() && !zeroLaborSale) laborCustomer = null;
  labor.rawSellingTotal = str(directCost?.isZero() && !zeroLaborSale ? null : laborRaw);
  labor.customerTotal = str(laborCustomer);
  labor.roundingDifference = laborCustomer === null || laborRaw === null ? null : str(laborCustomer.minus(laborRaw));
  labor.rawAllocatedLaborValue = labor.rawSellingTotal;
  labor.roundedCustomerLaborValue = labor.customerTotal;
  const target = from(labor.preciseLaborSellingTarget);
  labor.laborAllocationRoundingDelta = target === null || laborCustomer === null ? null : str(laborCustomer.minus(target));
  labor.allocationPrecisionDelta = target === null || labor.rawSellingTotal === null ? null : str(from(labor.rawSellingTotal)!.minus(target));
  const b2bBase = add(laborCustomer, from(material?.profit ?? null), from(material?.contingency ?? null));
  const b2bRate = b2bBase?.isZero() ? from(config.b2bServiceTaxRate) : inputs.read(config.b2bServiceTaxRate, "configuration.b2bServiceTaxRate", { fraction: true });
  const b2b = from(calculateB2bTax({ customerLaborTotal: str(laborCustomer), materialProfit: material?.profit ?? null, materialContingency: material?.contingency ?? null, rate: str(b2bRate) }).b2bServiceTaxAmount);
  const allComplete = inputs.diagnostics.length === 0;
  const rawFinal = allComplete ? add(from(material?.customerTotal ?? null), laborCustomer, b2b) : null;
  const payable = rawFinal?.toDecimalPlaces(2, Money.ROUND_HALF_UP) ?? null;
  const allocated = factor !== null;
  const recovered = allocated ? stages.rawProjectCost : directCost?.isZero() ? "0" : null;
  const unrecovered = stages.rawProjectCost === null || recovered === null ? null : str(d(stages.rawProjectCost).minus(recovered));
  return {
    status: inputs.diagnostics.some(issue => issue.category === "invalid") ? "invalid" : inputs.diagnostics.length ? "incomplete" : "complete",
    diagnostics: inputs.diagnostics, lines, labor, material,
    projectCosts: {
      entered: { ...input.projectCosts }, enteredCostTotal: stages.rawProjectCost, knownEnteredCostTotal: stages.knownProjectCost,
      allocatedCostTotal: recovered, unallocatedCostTotal: unrecovered,
      incurredProjectCosts: stages.rawProjectCost, recoveredProjectCosts: recovered, unrecoveredProjectCosts: unrecovered,
      unresolvedCosts: (["travel", "equipmentRental", "lodging"] as const).filter(key => labor[key] === null),
      unallocatedLoadedSellingValue: directCost?.isZero() ? labor.loadedTotal : null,
      allocationStatus: allocated ? "allocated" : directCost?.isZero() ? "unallocated" : "incomplete"
    },
    tax: { roundedCustomerLaborValue: str(laborCustomer), rawMaterialContingency: material?.contingency ?? null, rawMaterialProfit: material?.profit ?? null, materialIvuAmount: material?.materialIvuAmount ?? null, b2bTaxableBase: str(b2bBase), b2bServiceTaxRate: str(b2bRate), b2bServiceTaxAmount: str(b2b) },
    totals: { rawFinalCustomerTotal: str(rawFinal), finalPayableTotal: str(payable), payableRoundingAdjustment: payable === null || rawFinal === null ? null : str(payable.minus(rawFinal)) }
  };
}

export function formatAllocationFactor(value: Metric): string {
  return value === null ? "N/A" : `${d(value).toFixed(4)}×`;
}

/** Presentation-only addition; never used to feed group totals back into pricing. */
export function sumCalculatedValues(values: Metric[]): Metric {
  return str(add(...values.map(from)));
}
