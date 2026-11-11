"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { builderCalculationInput, builderWorkspaceSchema, type BuilderLoadResponse, type BuilderWorkspace } from "@pulse/contracts/quote-builder";
import { calculateQuote } from "@pulse/quote-calculator";
import { loadQuoteBuilder, saveQuoteBuilder, verifyBuilderCalculation } from "@/lib/api/quoteBuilder";
import { BuilderEditor } from "./BuilderEditor";
import { BuilderConfigurationNotice } from "./BuilderConfigurationNotice";
import { QuoteAnalysis } from "./QuoteAnalysis";
import { money } from "./BuilderFields";

/** One mounted editing session pins configuration until an explicit reload. Saves carry inputs only. */
export function PulseQuoteBuilder({ quoteId, enabled, canEdit, tab }: { quoteId: string; enabled: boolean; canEdit: boolean; tab: "builder" | "analysis" }) {
  const [session, setSession] = useState<BuilderLoadResponse | null>(null);
  const [state, setState] = useState<BuilderWorkspace | null>(null);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState(""); const [verifying, setVerifying] = useState(false);
  const [savedText, setSavedText] = useState(""); const [reloadPrompt, setReloadPrompt] = useState(false);
  const [expanded, setExpanded] = useState(new Set<string>());
  const current = useRef<BuilderWorkspace | null>(null); const token = useRef<number | null>(null); const persisted = useRef("");
  const inFlight = useRef<Promise<boolean> | null>(null); const mounted = useRef(true); const savingAllowed = useRef(canEdit && enabled);
  savingAllowed.current = canEdit && enabled;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = useCallback(async () => {
    setLoading(true); setError(""); setVerification("");
    try {
      const loaded = await loadQuoteBuilder(quoteId);
      if (!mounted.current) return;
      token.current = loaded.writeToken; current.current = loaded.state; persisted.current = JSON.stringify(loaded.state);
      setSession(loaded); setState(loaded.state); setSavedText(persisted.current); setReloadPrompt(false);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Unable to load Builder."); }
    finally { if (mounted.current) setLoading(false); }
  }, [quoteId]);
  // No dependency on parent fetches, focus, tabs, or settings responses.
  useEffect(() => { if (enabled && !current.current) void reload(); }, [enabled, reload]);
  const save = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    if (!savingAllowed.current || !current.current) return Promise.resolve(false);
    setSaving(true); setError("");
    const operation = async () => {
      try {
        while (current.current && JSON.stringify(current.current) !== persisted.current && savingAllowed.current) {
          const document = current.current;
          const validation = builderWorkspaceSchema.safeParse(document);
          if (!validation.success) throw new Error(validation.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" "));
          const serialized = JSON.stringify(document);
          const saved = await saveQuoteBuilder(quoteId, document, token.current);
          token.current = saved.writeToken; persisted.current = serialized;
          if (mounted.current) setSavedText(serialized);
        }
        return true;
      } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Unable to save Builder. Local edits are retained."); return false; }
      finally { inFlight.current = null; if (mounted.current) setSaving(false); }
    };
    // Defer starting so even synchronous validation failures clear the assigned promise.
    inFlight.current = Promise.resolve().then(operation);
    return inFlight.current;
  }, [quoteId]);
  const dirty = state !== null && JSON.stringify(state) !== savedText;
  useEffect(() => {
    if (!dirty || !canEdit || !enabled || error || reloadPrompt) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [state, dirty, canEdit, enabled, error, reloadPrompt, save]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const result = useMemo(() => state && session ? calculateQuote(builderCalculationInput(state, session.configuration)) : null, [state, session]);
  if (!session || !state || !result) return <section className="qb-empty" aria-live="polite">{error ? <><p role="alert">{error}</p><button className="toolbar-button" type="button" onClick={() => void reload()}>Retry loading Builder</button></> : <p>{enabled ? "Loading Builder…" : "Select Pulse to use the Quote Builder."}</p>}</section>;
  function change(next: BuilderWorkspace) { setVerification(""); current.current = next; setState(next); }
  return <div className="qb-workspace">
    <div className="qb-session-bar"><span role="status">{saving ? "Saving…" : error ? "Conflict / Error" : dirty ? "Unsaved" : token.current === null ? "Ready" : "Saved"} · <span className={`qb-status ${result.status}`}>{result.status}</span></span>
      <details><summary>Loaded configuration</summary><p>Company rates stay fixed for this editing session. Reload explicitly to obtain current settings.</p><code>{session.configurationId}</code><p><button type="button" className="toolbar-button compact" disabled={verifying || loading} onClick={async () => {
        setVerifying(true); setVerification("");
        const checked = current.current;
        try { await verifyBuilderCalculation(quoteId, state, session.configurationId); if (current.current === checked) setVerification("This calculation matches the current server configuration."); }
        catch (cause) { setVerification(cause instanceof Error ? cause.message : "Unable to verify configuration."); }
        finally { setVerifying(false); }
      }}>{verifying ? "Verifying…" : "Verify loaded configuration"}</button></p>{verification ? <p role="status">{verification}</p> : null}</details>
      <button className="toolbar-button compact" type="button" disabled={!canEdit || !enabled || !dirty || saving || loading} onClick={() => void save()}>Save now</button>
      <button className="toolbar-button compact" type="button" disabled={saving || loading} onClick={() => dirty ? setReloadPrompt(true) : void reload()}>{loading ? "Reloading…" : "Reload workspace"}</button>
    </div>
    {error ? <p role="alert" className="qb-error qb-notice">{error} Your local edits remain in this session.</p> : null}
    {reloadPrompt ? <div className="qb-reload-prompt" role="alert"><p>Reload replaces the open inputs and loads current company configuration. There are unsaved edits.</p><button className="primary-button compact" type="button" disabled={saving || loading || !canEdit || !enabled} onClick={async () => { if (await save()) await reload(); }}>Save and reload</button><button className="toolbar-button compact" type="button" disabled={saving || loading} onClick={() => void reload()}>Discard local edits and reload</button><button className="toolbar-button compact" type="button" onClick={() => setReloadPrompt(false)}>Cancel</button></div> : null}

    <div id="qb-configuration-issues"><BuilderConfigurationNotice diagnostics={result.diagnostics} configuration={session.configuration} /></div>
    {result.diagnostics.length ? <details className="qb-diagnostics" open={result.status === "invalid"}><summary>{result.diagnostics.length} calculation issue{result.diagnostics.length === 1 ? "" : "s"} · {result.status === "invalid" ? "Invalid inputs prevent calculation" : "Working inputs need completion"}</summary><ul>{result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.path}-${index}`}><strong>{diagnostic.category === "invalid" ? "Invalid" : "Incomplete"}:</strong> {diagnostic.lineId ? `${state.lines.find(line => line.id === diagnostic.lineId)?.name}: ` : ""}{diagnostic.message}{diagnostic.lineId && tab === "builder" ? <button type="button" className="toolbar-button compact" onClick={() => { setExpanded(new Set([...expanded, diagnostic.lineId!])); requestAnimationFrame(() => document.querySelector(`[data-builder-line="${diagnostic.lineId}"]`)?.scrollIntoView({ block: "center" })); }}>View line</button> : null}<small>{diagnostic.path}</small></li>)}</ul></details> : null}
    <div className="qb-layout"><div className="qb-main">
      <div hidden={tab !== "builder"}><BuilderEditor state={state} configuration={session.configuration} result={result} unavailableItemIds={session.unavailableItemIds} canEdit={canEdit && enabled && !loading && !reloadPrompt} onChange={change} expanded={expanded} setExpanded={setExpanded} /></div>
      {tab === "analysis" ? <QuoteAnalysis state={state} result={result} /> : null}
    </div><aside className="quote-summary-rail qb-summary"><section className="quote-total-card"><span>Financial summary</span><strong>{money(result.totals.finalPayableTotal)}</strong><span className={`qb-status ${result.status}`}>{result.status === "complete" ? "Complete calculation" : result.status === "invalid" ? "Invalid estimating inputs" : "Estimate needs completion"}</span><p>Current Builder calculation · {state.lines.length} lines</p><dl className="qb-amounts">
      <div><dt>Material selling value</dt><dd>{money(result.material?.customerTotal ?? null)}</dd></div><div><dt>Labor selling value</dt><dd>{money(result.labor.customerTotal)}</dd></div>
      <div><dt>Material IVU · included</dt><dd>{money(result.tax.materialIvuAmount)}</dd></div><div><dt>B2B / Service Tax</dt><dd>{money(result.tax.b2bServiceTaxAmount)}</dd></div>
    </dl>{result.status !== "complete" ? <p>Complete the calculation inputs to obtain a final customer total. Calculated material and direct labor stay visible while selling prices are pending. Entered project costs may remain unallocated.</p> : null}{result.diagnostics.some(issue => issue.path.startsWith("configuration.")) ? <a className="qb-settings-link" href="#qb-configuration-issues">View company settings needed for pricing</a> : null}</section></aside></div>
    {tab === "builder" ? <details className="qb-analysis-disclosure"><summary>Calculation Analysis <span>Costs, taxes, allocation &amp; rounding</span></summary><QuoteAnalysis state={state} result={result} /></details> : null}
  </div>;
}
