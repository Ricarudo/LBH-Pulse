import Decimal from "decimal.js-light";
import type { Metric } from "@pulse/contracts/quote-builder";

const TaxDecimal = Decimal.clone({ precision: 40 });
/** Replaceable Builder tax policy: Material IVU is embedded; B2B is added once. */
export function materialIvuUnit(base: Decimal | null, rate: Decimal | null, enabled: boolean): Decimal | null {
  return !enabled ? new TaxDecimal(0) : base === null || rate === null ? null : base.times(rate);
}
export function calculateB2bTax(input: { customerLaborTotal: Metric; materialProfit: Metric; materialContingency: Metric; rate: Metric }) {
  const values = [input.customerLaborTotal, input.materialProfit, input.materialContingency];
  if (values.some(value => value === null)) return { b2bTaxableBase: null, b2bServiceTaxAmount: null };
  const base = values.reduce<Decimal>((sum, value) => sum.plus(value!), new TaxDecimal(0));
  return { b2bTaxableBase: base.toFixed(), b2bServiceTaxAmount: base.isZero() ? "0" : input.rate === null ? null : base.times(input.rate).toFixed() };
}
