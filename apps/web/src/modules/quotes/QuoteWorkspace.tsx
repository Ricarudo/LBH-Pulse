"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  FileText,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { searchItems } from "@/lib/api/items";
import {
  addAdHocQuoteItem,
  addCatalogQuoteItem,
  addQuoteKit,
  fetchQuote,
  removeQuoteItem,
  updateQuote,
  updateQuoteItem,
  updateQuoteProposal
} from "@/lib/api/quotes";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import { normalizeQuoteDetailRecord } from "@/lib/quoteDetail";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  itemTypes,
  quoteBomSections,
  type ItemRecord,
  type ItemType,
  type QuoteBomSection,
  type QuoteItemRecord
} from "@pulse/contracts/items";
import type { QuoteDetailRecord, QuoteRecord } from "@pulse/contracts/work";
import {
  serviceCategories,
  type ServiceCategory
} from "@pulse/contracts/requests";
import { QuoteUpdatesPanel } from "./QuoteUpdatesPanel";

type QuoteWorkspaceProps = {
  quoteId: string;
};

type AdHocDraft = {
  section: QuoteBomSection;
  name: string;
  description: string;
  itemType: ItemType;
  quantity: string;
  unitOfMeasure: string;
  unitCost: string;
  unitPrice: string;
  discountPercent: string;
  taxable: boolean;
};

const blankAdHoc: AdHocDraft = {
  section: "Materials",
  name: "",
  description: "",
  itemType: "PRODUCT",
  quantity: "1",
  unitOfMeasure: "each",
  unitCost: "0",
  unitPrice: "0",
  discountPercent: "0",
  taxable: true
};

function lineMargin(item: QuoteItemRecord) {
  if (item.unitPrice <= 0) return 0;
  return ((item.unitPrice - item.unitCost) / item.unitPrice) * 100;
}

function compactDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

export function QuoteWorkspace({ quoteId }: QuoteWorkspaceProps) {
  const { user } = useCurrentUser();
  const canWrite = canUser(user, "quotes:write");
  const canWriteUpdates = canUser(user, "activity:write");
  const [quote, setQuote] = useState<QuoteDetailRecord | null>(null);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [adHocOpen, setAdHocOpen] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemRecord[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [addQuantity, setAddQuantity] = useState("1");
  const [adHocDraft, setAdHocDraft] = useState<AdHocDraft>(blankAdHoc);
  const [proposalNotes, setProposalNotes] = useState("");
  const [tradeEditorOpen, setTradeEditorOpen] = useState(false);
  const [tradeDraft, setTradeDraft] = useState<ServiceCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingLineSaves, setPendingLineSaves] = useState<Record<string, number>>({});
  const quoteMutationQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    async function loadQuote() {
      try {
        setLoading(true);
        setLoadError("");
        const data = await fetchQuote(quoteId, { cache: "no-store" });
        const nextQuote = normalizeQuoteDetailRecord(data.quote);
        setQuote(nextQuote);
        setProposalNotes(nextQuote.proposalNotes);
        setTradeDraft(nextQuote.trades as ServiceCategory[]);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load quote.");
      } finally {
        setLoading(false);
      }
    }
    void loadQuote();
  }, [quoteId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!addOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await searchItems(
          { q: itemQuery },
          { cache: "no-store", signal: controller.signal }
        );
        setItemResults(data.items);
      } catch {
        if (!controller.signal.aborted) setItemResults([]);
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addOpen, itemQuery]);

  const selectedItem = itemResults.find((item) => item.id === selectedItemId);
  const kitComponents = selectedItem?.relations.filter((relation) => relation.relationType === "KIT_COMPONENT") ?? [];
  const requiredRelations = selectedItem?.relations.filter((relation) => relation.relationType === "REQUIRED") ?? [];
  const suggestions = selectedItem?.relations.filter((relation) => relation.relationType === "RELATED" || relation.relationType === "OPTIONAL") ?? [];
  const selectedQuantity = Number(addQuantity || 1);

  const groupedItems = useMemo(
    () =>
      Object.fromEntries(
        quoteBomSections.map((section) => [
          section,
          quote?.items.filter((item) => item.section === section) ?? []
        ])
      ) as Record<QuoteBomSection, QuoteItemRecord[]>,
    [quote?.items]
  );

  function updateQuoteState(nextQuote: QuoteDetailRecord | QuoteRecord) {
    setQuote((current) => {
      const normalizedQuote = normalizeQuoteDetailRecord({
        ...(current ?? nextQuote),
        ...nextQuote
      });
      setProposalNotes(normalizedQuote.proposalNotes);
      setTradeDraft(normalizedQuote.trades as ServiceCategory[]);
      return normalizedQuote;
    });
  }

  function enqueueQuoteMutation<T>(mutation: () => Promise<T>) {
    const result = quoteMutationQueue.current.then(mutation, mutation);
    quoteMutationQueue.current = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function changePendingLineSaves(itemId: string, delta: number) {
    setPendingLineSaves((current) => {
      const count = Math.max(0, (current[itemId] ?? 0) + delta);
      if (count) return { ...current, [itemId]: count };
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function patchQuote(payload: Parameters<typeof updateQuote>[1]) {
    if (!quote) return false;
    const currentQuoteId = quote.id;
    try {
      const data = await enqueueQuoteMutation(() =>
        updateQuote(currentQuoteId, payload)
      );
      updateQuoteState({ ...quote, ...data.quote });
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update quote.");
      return false;
    }
  }

  async function saveTrades() {
    setBusy(true);
    const saved = await patchQuote({ trades: tradeDraft });
    setBusy(false);
    if (saved) {
      setTradeEditorOpen(false);
      setToast("Quote trades updated.");
    }
  }

  async function patchLine(
    item: QuoteItemRecord,
    payload: Parameters<typeof updateQuoteItem>[2]
  ) {
    if (!quote || !canWrite) return;
    const currentQuoteId = quote.id;
    changePendingLineSaves(item.id, 1);
    try {
      const data = await enqueueQuoteMutation(() =>
        updateQuoteItem(currentQuoteId, item.id, payload)
      );
      updateQuoteState(data.quote);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update BOM line.");
    } finally {
      changePendingLineSaves(item.id, -1);
    }
  }

  async function removeLine(item: QuoteItemRecord) {
    if (!quote || !canWrite) return;
    const currentQuoteId = quote.id;
    changePendingLineSaves(item.id, 1);
    try {
      const data = await enqueueQuoteMutation(() =>
        removeQuoteItem(currentQuoteId, item.id)
      );
      updateQuoteState(data.quote);
      setToast("BOM line removed.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to remove BOM line.");
    } finally {
      changePendingLineSaves(item.id, -1);
    }
  }

  async function addSelectedItem(fullKit = false) {
    if (!quote || !selectedItem) return;
    const currentQuoteId = quote.id;
    try {
      setBusy(true);
      const input = {
        itemId: selectedItem.id,
        quantity: selectedQuantity,
        suggestionItemIds: selectedSuggestionIds
      };
      const data = await enqueueQuoteMutation(() =>
        fullKit
          ? addQuoteKit(currentQuoteId, input)
          : addCatalogQuoteItem(currentQuoteId, input)
      );
      updateQuoteState(data.quote);
      setAddOpen(false);
      setSelectedItemId("");
      setSelectedSuggestionIds([]);
      setItemQuery("");
      setToast(fullKit ? "Kit added to BOM." : "Item added to BOM.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add item.");
    } finally {
      setBusy(false);
    }
  }

  async function addAdHocLine(event: FormEvent) {
    event.preventDefault();
    if (!quote || !adHocDraft.name.trim()) return;
    const currentQuoteId = quote.id;
    try {
      setBusy(true);
      const data = await enqueueQuoteMutation(() =>
        addAdHocQuoteItem(currentQuoteId, {
          ...adHocDraft,
          quantity: Number(adHocDraft.quantity || 1),
          unitCost: Number(adHocDraft.unitCost || 0),
          unitPrice: Number(adHocDraft.unitPrice || 0),
          discountPercent: Number(adHocDraft.discountPercent || 0)
        })
      );
      updateQuoteState(data.quote);
      setAdHocOpen(false);
      setAdHocDraft(blankAdHoc);
      setToast("Ad hoc BOM line added.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add BOM line.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProposalNotes() {
    if (!quote) return;
    const currentQuoteId = quote.id;
    try {
      setBusy(true);
      const data = await enqueueQuoteMutation(() =>
        updateQuoteProposal(currentQuoteId, { proposalNotes })
      );
      updateQuoteState(data.quote);
      setToast("Proposal preparation saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save proposal notes.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="quote-workspace"><div className="work-queue-state">Loading quote...</div></section>;
  }

  if (loadError || !quote) {
    return <section className="quote-workspace"><div className="work-queue-state error">{loadError || "Quote not found."}</div></section>;
  }

  return (
    <section className="quote-workspace">
      <header className="quote-workspace-header">
        <div>
          <Link className="toolbar-button compact" href="/quotes"><ArrowLeft size={16} />Quotes</Link>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link><span>/</span><Link href="/quotes">Quotes</Link><span>/</span><span>{quote.quoteNumber}</span>
          </nav>
          <h1>{quote.title}</h1>
          <p>{quote.quoteNumber} · {quote.clientName || "Unlinked client"} · {quote.context.requestNumber || "Manual quote"}</p>
        </div>
        <div className="quote-header-actions">
          <select
            value={quote.status}
            disabled={!canWrite}
            onChange={(event) =>
              void patchQuote({
                status: event.target.value as QuoteRecord["status"]
              })
            }
          >
            <option>Draft</option><option>Review</option><option>Sent</option><option>Approved</option><option>Rejected</option><option>Expired</option><option>Cancelled</option>
          </select>
          <button className="toolbar-button compact" type="button" onClick={() => setAdHocOpen(true)} disabled={!canWrite}><Plus size={16} />Ad hoc line</button>
          <button className="primary-button compact" type="button" onClick={() => setAddOpen(true)} disabled={!canWrite}><PackagePlus size={16} />Add Item</button>
        </div>
      </header>

      <section className="quote-context-grid" aria-label="Quote context">
        <article><span>Request</span><strong>{quote.context.requestNumber || "Manual quote"}</strong><p>{quote.context.requestTitle || quote.title}</p></article>
        <article className={quote.clientId ? "quote-context-linked" : undefined}>
          {quote.clientId ? (
            <Link
              href={`/clients/${quote.clientId}`}
              aria-label={`Open client workspace for ${quote.clientName}`}
            >
              <span>Client / Site</span>
              <strong>{quote.clientName || "Unlinked"}</strong>
              <p>{[quote.context.siteName, quote.context.city, quote.context.state].filter(Boolean).join(", ") || "No site snapshot"}</p>
            </Link>
          ) : (
            <>
              <span>Client / Site</span>
              <strong>Unlinked</strong>
              <p>{[quote.context.siteName, quote.context.city, quote.context.state].filter(Boolean).join(", ") || "No site snapshot"}</p>
            </>
          )}
        </article>
        <article><span>Contact</span><strong>{quote.context.contactName || "Not captured"}</strong><p>{quote.context.contactEmail || quote.context.contactPhone || "No contact method"}</p></article>
        <article className="quote-trades-card">
          <div className="quote-trades-heading">
            <span>{quote.trades.length === 1 ? "Trade" : "Trades"}</span>
            {canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setTradeDraft(quote.trades as ServiceCategory[]);
                  setTradeEditorOpen((current) => !current);
                }}
              >
                {tradeEditorOpen ? "Cancel" : "Manage"}
              </button>
            ) : null}
          </div>
          {quote.trades.length ? (
            <div className="quote-trade-tags">
              {quote.trades.map((trade) => <em key={trade}>{trade}</em>)}
            </div>
          ) : (
            <strong>Unclassified</strong>
          )}
          {tradeEditorOpen ? (
            <div className="quote-trade-editor">
              {serviceCategories.map((trade) => (
                <label key={trade} className={tradeDraft.includes(trade) ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={tradeDraft.includes(trade)}
                    onChange={(event) => setTradeDraft((current) =>
                      event.target.checked
                        ? [...current, trade]
                        : current.filter((value) => value !== trade)
                    )}
                  />
                  <span>{trade}</span>
                </label>
              ))}
              <button className="primary-button compact" type="button" disabled={busy} onClick={() => void saveTrades()}>
                {busy ? "Saving..." : "Save trades"}
              </button>
            </div>
          ) : (
            <p>{quote.context.scopeDescription || "No scope snapshot"}</p>
          )}
        </article>
      </section>

      <QuoteUpdatesPanel
        quoteId={quote.id}
        initialUpdates={quote.updates}
        initialCurrentStep={quote.currentStep}
        unreadMentionCount={quote.unreadMentionCount}
        canWrite={canWriteUpdates}
        onToast={setToast}
        onChange={(state) => setQuote((current) => current ? {
          ...current,
          updates: state.updates,
          currentStep: state.currentStep,
          unreadMentionCount: state.unreadMentionCount
        } : current)}
      />

      <div className="quote-workspace-grid">
        <section className="quote-bom-panel" aria-labelledby="quote-bom-heading">
          <div className="panel-header">
            <div><h2 id="quote-bom-heading">Bill of Materials</h2><p className="panel-note">Build the quote from reusable Directory Items or one-off BOM lines.</p></div>
            <strong>{formatMoney(quote.total)}</strong>
          </div>
          {quoteBomSections.map((section) => (
            <section className="quote-bom-section" key={section}>
              <div className="quote-bom-section-heading">
                <h3>{section}</h3>
                <span>{groupedItems[section].length} line{groupedItems[section].length === 1 ? "" : "s"}</span>
              </div>
              <table className="data-table quote-bom-table">
                <thead>
                  <tr>
                    <th>Item</th><th>SKU / Part</th><th>Qty</th><th>Cost</th><th>Price</th><th>Discount</th><th>Markup</th><th>Total</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems[section].map((item) => {
                    const lineSaving = Boolean(pendingLineSaves[item.id]);
                    return (
                    <tr key={`${item.id}:${item.updatedAt}`} aria-busy={lineSaving}>
                      <td>
                        <input className="quote-line-name-input" defaultValue={item.name} disabled={!canWrite || lineSaving} onBlur={(event) => { if (event.target.value !== item.name) void patchLine(item, { name: event.target.value }); }} />
                        <textarea defaultValue={item.description} disabled={!canWrite || lineSaving} onBlur={(event) => { if (event.target.value !== item.description) void patchLine(item, { description: event.target.value }); }} />
                      </td>
                      <td><strong>{item.sku || "No SKU"}</strong><br /><span className="table-muted">{item.partNumber || item.itemType}</span></td>
                      <td><input type="number" min="0.001" step="0.001" defaultValue={item.quantity} disabled={!canWrite || lineSaving} onBlur={(event) => { const value = Number(event.target.value || 1); if (value !== item.quantity) void patchLine(item, { quantity: value }); }} /></td>
                      <td><input type="number" min="0" step="0.01" defaultValue={item.unitCost} disabled={!canWrite || lineSaving} onBlur={(event) => { const value = Number(event.target.value || 0); if (value !== item.unitCost) void patchLine(item, { unitCost: value }); }} /></td>
                      <td><input type="number" min="0" step="0.01" defaultValue={item.unitPrice} disabled={!canWrite || lineSaving} onBlur={(event) => { const value = Number(event.target.value || 0); if (value !== item.unitPrice) void patchLine(item, { unitPrice: value }); }} /></td>
                      <td><input type="number" min="0" max="100" step="0.01" defaultValue={item.discountPercent} disabled={!canWrite || lineSaving} onBlur={(event) => { const value = Number(event.target.value || 0); if (value !== item.discountPercent) void patchLine(item, { discountPercent: value }); }} /></td>
                      <td><strong>{item.markupPercent.toFixed(1)}%</strong><br /><span className="table-muted">{lineMargin(item).toFixed(1)}% margin</span></td>
                      <td><strong>{formatMoney(item.lineTotal)}</strong>{lineSaving ? <><br /><span className="table-muted">Saving...</span></> : null}</td>
                      <td><button className="icon-button" type="button" aria-label={`Remove ${item.name}`} disabled={!canWrite || lineSaving} onClick={() => void removeLine(item)}><Trash2 size={16} /></button></td>
                    </tr>
                    );
                  })}
                  {!groupedItems[section].length ? (
                    <tr><td colSpan={9}><div className="quote-empty-section"><Boxes size={18} />No {section.toLowerCase()} lines yet.</div></td></tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          ))}
        </section>

        <aside className="quote-summary-rail">
          <section className="quote-total-card">
            <span>Quote Total</span>
            <strong>{formatMoney(quote.total)}</strong>
            <p>{quote.items.length} BOM line{quote.items.length === 1 ? "" : "s"}</p>
          </section>
          <section className="quote-proposal-panel">
            <div className="settings-section-title">
              <div><h3>Proposal Preparation</h3><p>Reserved space for future proposal package, review, and export features.</p></div>
              <FileText size={20} />
            </div>
            <dl>
              <div><dt>Prepared</dt><dd>{quote.proposalPreparedAt ? compactDate(quote.proposalPreparedAt) : "Not prepared"}</dd></div>
              <div><dt>Scope Source</dt><dd>{quote.context.requestNumber || "Manual quote"}</dd></div>
            </dl>
            <label>
              Internal proposal notes
              <textarea value={proposalNotes} onChange={(event) => setProposalNotes(event.target.value)} disabled={!canWrite} />
            </label>
            <button className="primary-button compact" type="button" onClick={() => void saveProposalNotes()} disabled={!canWrite || busy}>
              <Save size={15} />Save prep
            </button>
          </section>
        </aside>
      </div>

      {addOpen ? (
        <div className="client-create-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false); }}>
          <section className="client-create-dialog quote-add-dialog" role="dialog" aria-modal="true">
            <div className="client-create-dialog-header">
              <div><span className="dashboard-eyebrow">Directory Items</span><h3>Add Item</h3></div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setAddOpen(false)}><X size={18} /></button>
            </div>
            <label className="lead-search">
              <Search size={17} /><input autoFocus type="search" placeholder="Search active items..." value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} />
            </label>
            <div className="quote-add-layout">
              <div className="quote-item-results">
                {itemResults.map((item) => (
                  <button type="button" className={selectedItemId === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedItemId(item.id); setSelectedSuggestionIds([]); }}>
                    <strong>{item.name}</strong><span>{item.itemType} · {item.sku || item.partNumber || "No SKU"}</span><em>{formatMoney(item.sellPrice)}</em>
                  </button>
                ))}
              </div>
              <aside className="quote-selected-item">
                {selectedItem ? (
                  <>
                    <h4>{selectedItem.name}</h4>
                    <p>{selectedItem.quoteDescription || selectedItem.description || "No quote description."}</p>
                    <div><span>Cost</span><strong>{formatMoney(selectedItem.cost)}</strong><span>Price</span><strong>{formatMoney(selectedItem.sellPrice)}</strong></div>
                    <label className="material-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={addQuantity} onChange={(event) => setAddQuantity(event.target.value)} /></label>
                    {requiredRelations.length ? <div className="quote-relation-list"><strong>Added automatically</strong>{requiredRelations.map((relation) => <span key={relation.id}>{selectedQuantity * relation.defaultQuantity} × {relation.childItemName} · Required</span>)}</div> : null}
                    {selectedItem.defaultLaborItemId && selectedItem.defaultLaborHours > 0 ? <div className="quote-relation-list"><strong>Default labor</strong><span>{selectedQuantity * selectedItem.defaultLaborHours} labor hour{selectedQuantity * selectedItem.defaultLaborHours === 1 ? "" : "s"} added automatically</span></div> : null}
                    {kitComponents.length ? <div className="quote-relation-list"><strong>Full kit components</strong>{kitComponents.map((relation) => <span key={relation.id}>{selectedQuantity * relation.defaultQuantity} × {relation.childItemName}</span>)}<span>The kit parent is not priced again when expanded.</span></div> : null}
                    {suggestions.length ? <div className="quote-relation-list"><strong>Optional suggestions</strong>{suggestions.map((relation) => <label key={relation.id}><input type="checkbox" checked={selectedSuggestionIds.includes(relation.childItemId)} onChange={(event) => setSelectedSuggestionIds((current) => event.target.checked ? [...current, relation.childItemId] : current.filter((id) => id !== relation.childItemId))} />{selectedQuantity * relation.defaultQuantity} × {relation.childItemName} · {relation.relationType}</label>)}</div> : null}
                    <div className="client-create-dialog-actions">
                      {kitComponents.length ? <button className="toolbar-button compact" type="button" disabled={busy} onClick={() => void addSelectedItem(true)}>Expand full kit</button> : null}
                      <button className="primary-button compact" type="button" disabled={busy} onClick={() => void addSelectedItem(false)}>Add selected</button>
                    </div>
                  </>
                ) : <div className="work-queue-state">Select an item to preview it.</div>}
              </aside>
            </div>
          </section>
        </div>
      ) : null}

      {adHocOpen ? (
        <div className="client-create-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdHocOpen(false); }}>
          <form className="client-create-dialog" role="dialog" aria-modal="true" onSubmit={addAdHocLine}>
            <div className="client-create-dialog-header">
              <div><span className="dashboard-eyebrow">BOM line</span><h3>Add ad hoc line</h3></div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setAdHocOpen(false)}><X size={18} /></button>
            </div>
            <div className="material-field-grid">
              <label className="material-field"><span>Name</span><input required value={adHocDraft.name} onChange={(event) => setAdHocDraft({ ...adHocDraft, name: event.target.value })} /></label>
              <label className="material-field"><span>Section</span><select value={adHocDraft.section} onChange={(event) => setAdHocDraft({ ...adHocDraft, section: event.target.value as QuoteBomSection })}>{quoteBomSections.map((section) => <option key={section}>{section}</option>)}</select></label>
              <label className="material-field"><span>Type</span><select value={adHocDraft.itemType} onChange={(event) => setAdHocDraft({ ...adHocDraft, itemType: event.target.value as ItemType })}>{itemTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="material-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={adHocDraft.quantity} onChange={(event) => setAdHocDraft({ ...adHocDraft, quantity: event.target.value })} /></label>
              <label className="material-field"><span>Unit</span><input value={adHocDraft.unitOfMeasure} onChange={(event) => setAdHocDraft({ ...adHocDraft, unitOfMeasure: event.target.value })} /></label>
              <label className="material-field"><span>Cost</span><input type="number" min="0" step="0.01" value={adHocDraft.unitCost} onChange={(event) => setAdHocDraft({ ...adHocDraft, unitCost: event.target.value })} /></label>
              <label className="material-field"><span>Price</span><input type="number" min="0" step="0.01" value={adHocDraft.unitPrice} onChange={(event) => setAdHocDraft({ ...adHocDraft, unitPrice: event.target.value })} /></label>
              <label className="material-field"><span>Discount %</span><input type="number" min="0" max="100" step="0.01" value={adHocDraft.discountPercent} onChange={(event) => setAdHocDraft({ ...adHocDraft, discountPercent: event.target.value })} /></label>
              <label className="material-field item-checkbox-field"><span>Taxable</span><input type="checkbox" checked={adHocDraft.taxable} onChange={(event) => setAdHocDraft({ ...adHocDraft, taxable: event.target.checked })} /></label>
              <label className="material-field item-field-wide"><span>Description</span><textarea value={adHocDraft.description} onChange={(event) => setAdHocDraft({ ...adHocDraft, description: event.target.value })} /></label>
            </div>
            <div className="client-create-dialog-actions"><button className="toolbar-button compact" type="button" onClick={() => setAdHocOpen(false)}>Cancel</button><button className="primary-button compact" type="submit" disabled={busy}>Add line</button></div>
          </form>
        </div>
      ) : null}

      {toast ? <div className="work-queue-toast" role="status">{toast}</div> : null}
    </section>
  );
}
