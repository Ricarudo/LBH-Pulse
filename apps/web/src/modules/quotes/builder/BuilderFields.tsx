"use client";
import { useEffect, useId, useState } from "react";
import type { CalculationDiagnostic, Metric } from "@pulse/contracts/quote-builder";
import { fractionText, percentText } from "@/lib/quoteBuilder";

export function DecimalField({ label, value, onChange, percentage = false, disabled = false, hint, compact = false, diagnostic, maxDecimalPlaces }: {
  label: string; value: Metric; onChange: (value: Metric) => void; percentage?: boolean; disabled?: boolean; hint?: string; compact?: boolean; diagnostic?: CalculationDiagnostic; maxDecimalPlaces?: number;
}) {
  const display = percentage ? percentText(value) : value ?? "";
  const [draft, setDraft] = useState(display); const [error, setError] = useState(""); const id = useId();
  useEffect(() => { setDraft(display); setError(""); }, [display]);
  function commit() {
    if (draft.trim() && !/^-?\d+(\.\d+)?$/.test(draft)) { setError("Enter a decimal number."); return; }
    if (maxDecimalPlaces !== undefined && (draft.split(".")[1]?.length ?? 0) > maxDecimalPlaces) { setError(`Use at most ${maxDecimalPlaces} decimal places.`); return; }
    setError(""); const next = percentage ? fractionText(draft) : draft.trim() || null;
    if (next !== value) onChange(next);
  }
  const help = error || diagnostic?.message || hint;
  return <label className={`qb-field${compact ? " qb-field-compact" : ""}`}>
    <span className={compact ? "sr-only" : undefined}>{label}{percentage ? " (%)" : ""}</span>
    <input id={id} aria-invalid={Boolean(error) || diagnostic?.category === "invalid"} aria-describedby={help ? `${id}-help` : undefined} inputMode="decimal" value={draft} disabled={disabled} placeholder="Not set" onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />
    {help ? <small id={`${id}-help`} className={error || diagnostic?.category === "invalid" ? "qb-error" : diagnostic ? "qb-warning" : undefined}>{help}</small> : null}
  </label>;
}
export function money(value: Metric, maximumFractionDigits = 2) { return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits }).format(Number(value)); }
export function numberText(value: Metric) { return value === null ? "N/A" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(Number(value)); }
