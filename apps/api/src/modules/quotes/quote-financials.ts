import { Prisma } from "@/generated/prisma/client";
import type {
  LegacyQuoteFinancials,
  QuoteCalculationMode,
  QuoteFinancialSummary
} from "@pulse/contracts/work";

type DecimalValue = Prisma.Decimal | string | number;

export type QuoteFinancialSummaryDecimal = {
  materialRevenue: Prisma.Decimal;
  laborRevenue: Prisma.Decimal;
  serviceRevenue: Prisma.Decimal;
  preTaxContractValue: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  finalCustomerTotal: Prisma.Decimal;
  materialCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  serviceCost: Prisma.Decimal;
  totalEstimatedCost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  grossMarginPercent: Prisma.Decimal | null;
  markupPercent: Prisma.Decimal | null;
  estimatedDurationBusinessDays: number | null;
};

export type PulseFinancialLine = {
  itemType: "PRODUCT" | "LABOR" | "SERVICE";
  quantity: DecimalValue;
  unitCost: DecimalValue;
  lineSubtotal: DecimalValue;
  lineTax: DecimalValue;
};

const zero = () => new Prisma.Decimal(0);
const decimal = (value: DecimalValue) => new Prisma.Decimal(value);
const money = (value: DecimalValue) => decimal(value).toDecimalPlaces(2);

function percent(numerator: Prisma.Decimal, denominator: Prisma.Decimal) {
  return denominator.isZero()
    ? null
    : numerator.dividedBy(denominator).times(100).toDecimalPlaces(2);
}

function finishSummary(input: {
  materialRevenue: Prisma.Decimal;
  laborRevenue: Prisma.Decimal;
  serviceRevenue: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  materialCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  serviceCost: Prisma.Decimal;
  estimatedDurationBusinessDays: number | null;
}): QuoteFinancialSummaryDecimal {
  const preTaxContractValue = input.materialRevenue
    .plus(input.laborRevenue)
    .plus(input.serviceRevenue)
    .toDecimalPlaces(2);
  const totalEstimatedCost = input.materialCost
    .plus(input.laborCost)
    .plus(input.serviceCost)
    .toDecimalPlaces(2);
  const grossProfit = preTaxContractValue.minus(totalEstimatedCost).toDecimalPlaces(2);
  return {
    ...input,
    preTaxContractValue,
    totalEstimatedCost,
    grossProfit,
    taxAmount: input.taxAmount.toDecimalPlaces(2),
    finalCustomerTotal: preTaxContractValue.plus(input.taxAmount).toDecimalPlaces(2),
    grossMarginPercent: percent(grossProfit, preTaxContractValue),
    markupPercent: percent(grossProfit, totalEstimatedCost)
  };
}

export function calculateLegacyQuoteFinancials(input: {
  materialSale: DecimalValue;
  materialCost: DecimalValue;
  laborSale: DecimalValue;
  laborCost: DecimalValue;
  taxAmount: DecimalValue;
  estimatedDurationBusinessDays: number | null;
}) {
  return finishSummary({
    materialRevenue: money(input.materialSale),
    laborRevenue: money(input.laborSale),
    serviceRevenue: zero(),
    taxAmount: money(input.taxAmount),
    materialCost: money(input.materialCost),
    laborCost: money(input.laborCost),
    serviceCost: zero(),
    estimatedDurationBusinessDays: input.estimatedDurationBusinessDays
  });
}

export function calculatePulseQuoteFinancials(lines: PulseFinancialLine[]) {
  const buckets = {
    PRODUCT: { revenue: zero(), cost: zero() },
    LABOR: { revenue: zero(), cost: zero() },
    SERVICE: { revenue: zero(), cost: zero() }
  };
  let taxAmount = zero();
  for (const line of lines) {
    const bucket = buckets[line.itemType];
    bucket.revenue = bucket.revenue.plus(line.lineSubtotal);
    bucket.cost = bucket.cost.plus(decimal(line.quantity).times(line.unitCost));
    taxAmount = taxAmount.plus(line.lineTax);
  }
  return finishSummary({
    materialRevenue: buckets.PRODUCT.revenue.toDecimalPlaces(2),
    laborRevenue: buckets.LABOR.revenue.toDecimalPlaces(2),
    serviceRevenue: buckets.SERVICE.revenue.toDecimalPlaces(2),
    taxAmount: taxAmount.toDecimalPlaces(2),
    materialCost: buckets.PRODUCT.cost.toDecimalPlaces(2),
    laborCost: buckets.LABOR.cost.toDecimalPlaces(2),
    serviceCost: buckets.SERVICE.cost.toDecimalPlaces(2),
    estimatedDurationBusinessDays: null
  });
}

export function calculateQuoteLine(input: {
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discountPercent: DecimalValue;
  lineTax?: DecimalValue;
}) {
  const gross = decimal(input.quantity).times(input.unitPrice);
  const discount = gross.times(input.discountPercent).dividedBy(100);
  const lineSubtotal = Prisma.Decimal.max(0, gross.minus(discount)).toDecimalPlaces(2);
  const lineTax = money(input.lineTax ?? 0);
  return {
    lineSubtotal: lineSubtotal.toNumber(),
    lineTax: lineTax.toNumber(),
    lineTotal: lineSubtotal.plus(lineTax).toDecimalPlaces(2).toNumber()
  };
}

export function calculateMarkupPercent(unitCost: DecimalValue, unitPrice: DecimalValue) {
  const cost = decimal(unitCost);
  if (cost.isZero()) return 0;
  return decimal(unitPrice).minus(cost).dividedBy(cost).times(100).toDecimalPlaces(2).toNumber();
}

export function toQuoteFinancialSummary(
  summary: QuoteFinancialSummaryDecimal
): QuoteFinancialSummary {
  return {
    materialRevenue: summary.materialRevenue.toNumber(),
    laborRevenue: summary.laborRevenue.toNumber(),
    serviceRevenue: summary.serviceRevenue.toNumber(),
    preTaxContractValue: summary.preTaxContractValue.toNumber(),
    taxAmount: summary.taxAmount.toNumber(),
    finalCustomerTotal: summary.finalCustomerTotal.toNumber(),
    materialCost: summary.materialCost.toNumber(),
    laborCost: summary.laborCost.toNumber(),
    serviceCost: summary.serviceCost.toNumber(),
    totalEstimatedCost: summary.totalEstimatedCost.toNumber(),
    grossProfit: summary.grossProfit.toNumber(),
    grossMarginPercent: summary.grossMarginPercent?.toNumber() ?? null,
    markupPercent: summary.markupPercent?.toNumber() ?? null,
    estimatedDurationBusinessDays: summary.estimatedDurationBusinessDays
  };
}

export function legacyFinancialsRecord(input: {
  legacyMaterialSale: DecimalValue;
  legacyMaterialCost: DecimalValue;
  legacyLaborSale: DecimalValue;
  legacyLaborCost: DecimalValue;
  legacyTaxAmount: DecimalValue;
  legacyEstimatedDurationBusinessDays: number | null;
}): LegacyQuoteFinancials {
  return {
    materialSale: decimal(input.legacyMaterialSale).toNumber(),
    materialCost: decimal(input.legacyMaterialCost).toNumber(),
    laborSale: decimal(input.legacyLaborSale).toNumber(),
    laborCost: decimal(input.legacyLaborCost).toNumber(),
    taxAmount: decimal(input.legacyTaxAmount).toNumber(),
    estimatedDurationBusinessDays: input.legacyEstimatedDurationBusinessDays
  };
}

export function exactFinancialSummarySnapshot(summary: QuoteFinancialSummaryDecimal) {
  return {
    materialRevenue: summary.materialRevenue.toFixed(2),
    laborRevenue: summary.laborRevenue.toFixed(2),
    serviceRevenue: summary.serviceRevenue.toFixed(2),
    preTaxContractValue: summary.preTaxContractValue.toFixed(2),
    taxAmount: summary.taxAmount.toFixed(2),
    finalCustomerTotal: summary.finalCustomerTotal.toFixed(2),
    materialCost: summary.materialCost.toFixed(2),
    laborCost: summary.laborCost.toFixed(2),
    serviceCost: summary.serviceCost.toFixed(2),
    totalEstimatedCost: summary.totalEstimatedCost.toFixed(2),
    grossProfit: summary.grossProfit.toFixed(2),
    grossMarginPercent: summary.grossMarginPercent?.toFixed(2) ?? null,
    markupPercent: summary.markupPercent?.toFixed(2) ?? null,
    estimatedDurationBusinessDays: summary.estimatedDurationBusinessDays
  };
}

export function quoteFinancialsAreEmpty(input: {
  calculationMode: QuoteCalculationMode;
  itemCount: number;
  legacyMaterialSale: DecimalValue;
  legacyMaterialCost: DecimalValue;
  legacyLaborSale: DecimalValue;
  legacyLaborCost: DecimalValue;
  legacyTaxAmount: DecimalValue;
  legacyEstimatedDurationBusinessDays: number | null;
}) {
  if (input.calculationMode === "PULSE") return input.itemCount === 0;
  return [
    input.legacyMaterialSale,
    input.legacyMaterialCost,
    input.legacyLaborSale,
    input.legacyLaborCost,
    input.legacyTaxAmount
  ].every((value) => decimal(value).isZero()) &&
    (input.legacyEstimatedDurationBusinessDays ?? 0) === 0;
}
