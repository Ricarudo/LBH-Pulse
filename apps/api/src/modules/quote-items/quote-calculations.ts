export function calculateMarkupPercent(unitCost: number, unitPrice: number) {
  if (unitCost <= 0) return 0;
  return Number((((unitPrice - unitCost) / unitCost) * 100).toFixed(2));
}

export function calculateQuoteLine(input: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}) {
  const gross = input.quantity * input.unitPrice;
  const discount = gross * (input.discountPercent / 100);
  const lineSubtotal = Number(Math.max(0, gross - discount).toFixed(2));
  return {
    lineSubtotal,
    lineTax: 0,
    lineTotal: lineSubtotal
  };
}
