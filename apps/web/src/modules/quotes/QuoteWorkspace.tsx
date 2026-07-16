"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  Boxes,
  Clock3,
  Eye,
  FileText,
  History,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { ViewportPortal } from "@/components/ViewportPortal";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { searchItems } from "@/lib/api/items";
import {
  addAdHocQuoteItem,
  addCatalogQuoteItem,
  addQuoteKit,
  createQuoteRevision,
  convertQuoteToProject,
  fetchQuote,
  fetchQuoteRevision,
  fetchQuoteUpdateTeamMembers,
  removeQuoteItem,
  replaceLegacyQuoteFinancials,
  switchQuoteCalculationMode,
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
import type {
  QuoteDetailRecord,
  LifecycleTab,
  LegacyQuoteFinancials,
  QuoteCalculationMode,
  QuoteFinancialSummary,
  QuoteRecord,
  QuoteRevisionDetailRecord,
  QuoteVersionSummary
} from "@pulse/contracts/work";
import {
  serviceCategories,
  type RequestAssignee,
  type ServiceCategory
} from "@pulse/contracts/requests";
import { QuoteUpdatesPanel } from "./QuoteUpdatesPanel";

type QuoteWorkspaceProps = {
  quoteId: string;
  initialTab?: LifecycleTab;
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

const revisionEligibleStatuses = new Set<QuoteRecord["status"]>([
  "Sent",
  "Approved",
  "Rejected",
  "Cancelled"
]);

type LegacyFinancialDraft = Record<
  "materialSale" | "materialCost" | "laborSale" | "laborCost" | "taxAmount" | "estimatedDurationBusinessDays",
  string
>;

function legacyDraft(financials: LegacyQuoteFinancials): LegacyFinancialDraft {
  return {
    materialSale: String(financials.materialSale),
    materialCost: String(financials.materialCost),
    laborSale: String(financials.laborSale),
    laborCost: String(financials.laborCost),
    taxAmount: String(financials.taxAmount),
    estimatedDurationBusinessDays: financials.estimatedDurationBusinessDays === null
      ? ""
      : String(financials.estimatedDurationBusinessDays)
  };
}

function SummaryMetrics({ summary }: { summary: QuoteFinancialSummary }) {
  const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
  return (
    <dl className="quote-financial-summary">
      <div><dt>Material revenue</dt><dd>{formatMoney(summary.materialRevenue)}</dd></div>
      <div><dt>Labor revenue</dt><dd>{formatMoney(summary.laborRevenue)}</dd></div>
      {summary.serviceRevenue !== 0 ? <div><dt>Service revenue</dt><dd>{formatMoney(summary.serviceRevenue)}</dd></div> : null}
      <div className="summary-emphasis"><dt>Pre-tax contract value</dt><dd>{formatMoney(summary.preTaxContractValue)}</dd></div>
      <div><dt>Estimated cost</dt><dd>{formatMoney(summary.totalEstimatedCost)}</dd></div>
      <div><dt>Gross profit</dt><dd>{formatMoney(summary.grossProfit)}</dd></div>
      <div><dt>Gross margin</dt><dd>{percent(summary.grossMarginPercent)}</dd></div>
      <div><dt>Markup</dt><dd>{percent(summary.markupPercent)}</dd></div>
      <div><dt>Tax</dt><dd>{formatMoney(summary.taxAmount)}</dd></div>
      <div className="summary-total"><dt>Final customer total</dt><dd>{formatMoney(summary.finalCustomerTotal)}</dd></div>
      {summary.estimatedDurationBusinessDays !== null ? <div><dt>Estimated duration</dt><dd>{summary.estimatedDurationBusinessDays} business days</dd></div> : null}
    </dl>
  );
}

function lineMargin(item: QuoteItemRecord) {
  if (item.unitPrice <= 0) return 0;
  return ((item.unitPrice - item.unitCost) / item.unitPrice) * 100;
}

function compactDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

export function QuoteWorkspace({ quoteId, initialTab = "work" }: QuoteWorkspaceProps) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canWrite = canUser(user, "quotes:write");
  const canWriteUpdates = canUser(user, "activity:write");
  const [quote, setQuote] = useState<QuoteDetailRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
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
  const [activeTab, setActiveTab] = useState<LifecycleTab>(initialTab);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [tradeEditorOpen, setTradeEditorOpen] = useState(false);
  const [tradeDraft, setTradeDraft] = useState<ServiceCategory[]>([]);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [legacyFinancialDraft, setLegacyFinancialDraft] = useState<LegacyFinancialDraft | null>(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<QuoteCalculationMode | null>(null);
  const [projectConversionOpen, setProjectConversionOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<QuoteRevisionDetailRecord | null>(null);
  const [historyLoadingVersion, setHistoryLoadingVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingLineSaves, setPendingLineSaves] = useState<Record<string, number>>({});
  const quoteMutationQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    async function loadQuote() {
      try {
        setLoading(true);
        setLoadError("");
        const [data, teamData] = await Promise.all([
          fetchQuote(quoteId, { cache: "no-store" }),
          fetchQuoteUpdateTeamMembers({ cache: "no-store" })
        ]);
        const nextQuote = normalizeQuoteDetailRecord(data.quote);
        setQuote(nextQuote);
        setAssignees(teamData.teamMembers);
        setProposalNotes(nextQuote.proposalNotes);
        setLegacyFinancialDraft(legacyDraft(nextQuote.legacyFinancials));
        setDetailsDraft(nextQuote.lifecycleContext.details);
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
      setLegacyFinancialDraft(legacyDraft(normalizedQuote.legacyFinancials));
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

  function selectTab(tab: LifecycleTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function saveLifecycleDetails() {
    setBusy(true);
    const saved = await patchQuote({ lifecycleDetails: detailsDraft });
    setBusy(false);
    if (saved) {
      setQuote((current) => current ? {
        ...current,
        lifecycleContext: {
          ...current.lifecycleContext,
          details: detailsDraft,
          updatedAt: new Date().toISOString(),
          updatedByName: user?.name ?? "Pulse System"
        }
      } : current);
      setDetailsEditing(false);
      setToast("Details saved for the full lifecycle.");
    }
  }

  async function assignQuotePerson(assignedToId: string) {
    if (!quote || !canWrite || busy) return;
    setBusy(true);
    const saved = await patchQuote({ assignedToId: assignedToId || null });
    setBusy(false);
    if (saved) {
      const assignedName = assignees.find((assignee) => assignee.id === assignedToId)?.name ?? "Unassigned";
      setToast(`${quote.quoteNumber} assigned to ${assignedName}.`);
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

  async function requestRevision(event: FormEvent) {
    event.preventDefault();
    if (!quote || !revisionReason.trim() || revisionBusy) return;
    try {
      setRevisionBusy(true);
      const data = await createQuoteRevision(quote.id, { reason: revisionReason.trim() });
      updateQuoteState(data.quote);
      setRevisionDialogOpen(false);
      setRevisionReason("");
      setToast(`${data.quote.quoteNumber} opened as a draft revision.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create the quote revision.");
    } finally {
      setRevisionBusy(false);
    }
  }

  async function saveLegacyFinancials(event: FormEvent) {
    event.preventDefault();
    if (!quote || !legacyFinancialDraft || busy) return;
    if ([
      legacyFinancialDraft.materialSale,
      legacyFinancialDraft.materialCost,
      legacyFinancialDraft.laborSale,
      legacyFinancialDraft.laborCost,
      legacyFinancialDraft.taxAmount
    ].some((value) => value.trim() === "")) {
      setToast("Complete every sale, cost, and tax field. Use zero when none applies.");
      return;
    }
    const values = {
      materialSale: Number(legacyFinancialDraft.materialSale),
      materialCost: Number(legacyFinancialDraft.materialCost),
      laborSale: Number(legacyFinancialDraft.laborSale),
      laborCost: Number(legacyFinancialDraft.laborCost),
      taxAmount: Number(legacyFinancialDraft.taxAmount),
      estimatedDurationBusinessDays: legacyFinancialDraft.estimatedDurationBusinessDays === ""
        ? null
        : Number(legacyFinancialDraft.estimatedDurationBusinessDays)
    };
    if (
      Object.entries(values).some(([key, value]) =>
        key === "estimatedDurationBusinessDays"
          ? value !== null && (!Number.isInteger(value) || value < 0)
          : value === null || !Number.isFinite(value) || value < 0
      )
    ) {
      setToast("Enter nonnegative monetary values and a whole number of business days.");
      return;
    }
    try {
      setBusy(true);
      const data = await replaceLegacyQuoteFinancials(quote.id, values);
      updateQuoteState(data.quote);
      setToast("Legacy financial summary saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save the financial summary.");
    } finally {
      setBusy(false);
    }
  }

  function requestModeChange(mode: QuoteCalculationMode) {
    if (!quote || mode === quote.calculationMode) return;
    setTargetMode(mode);
    const summary = quote.financialSummary;
    const financiallyEmpty = quote.items.length === 0 &&
      summary.preTaxContractValue === 0 &&
      summary.totalEstimatedCost === 0 &&
      summary.taxAmount === 0 &&
      (summary.estimatedDurationBusinessDays === null || summary.estimatedDurationBusinessDays === 0);
    if (financiallyEmpty) {
      void changeCalculationModeFor(mode, false);
      return;
    }
    setModeDialogOpen(true);
  }

  async function changeCalculationModeFor(mode: QuoteCalculationMode, discardFinancialData: boolean) {
    if (!quote || mode === quote.calculationMode || busy) return;
    try {
      setBusy(true);
      const data = await switchQuoteCalculationMode(quote.id, {
        calculationMode: mode,
        discardFinancialData
      });
      updateQuoteState(data.quote);
      setModeDialogOpen(false);
      setTargetMode(null);
      setToast(`Changed to ${mode === "LEGACY" ? "Legacy Quote" : "Pulse Quote"}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to change calculation mode.");
    } finally {
      setBusy(false);
    }
  }

  async function convertToProject() {
    if (!quote || busy) return;
    try {
      setBusy(true);
      const data = await convertQuoteToProject(quote.id);
      setProjectConversionOpen(false);
      router.push(`/projects/${data.project.id}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to convert this quote.");
    } finally {
      setBusy(false);
    }
  }

  async function openHistoricalVersion(version: QuoteVersionSummary) {
    if (!quote || version.isCurrent || historyLoadingVersion !== null) return;
    try {
      setHistoryLoadingVersion(version.revisionNumber);
      const data = await fetchQuoteRevision(quote.id, version.revisionNumber, {
        cache: "no-store"
      });
      setSelectedVersion(data.revision);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to load this quote version.");
    } finally {
      setHistoryLoadingVersion(null);
    }
  }

  if (loading) {
    return <section className="quote-workspace"><div className="work-queue-state">Loading quote...</div></section>;
  }

  if (loadError || !quote) {
    return <section className="quote-workspace"><div className="work-queue-state error">{loadError || "Quote not found."}</div></section>;
  }

  const financiallyEmpty = quote.items.length === 0 &&
    quote.financialSummary.preTaxContractValue === 0 &&
    quote.financialSummary.totalEstimatedCost === 0 &&
    quote.financialSummary.taxAmount === 0 &&
    (quote.financialSummary.estimatedDurationBusinessDays === null ||
      quote.financialSummary.estimatedDurationBusinessDays === 0);

  return (
    <section className="quote-workspace">
      <header className="quote-workspace-header lifecycle-record-header">
        <Link
          className="lifecycle-record-back"
          href="/quotes"
          aria-label="Back to quotes queue"
          title="Back to quotes queue"
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="lifecycle-record-identity">
          <span>{quote.quoteNumber} <em className={`quote-mode-badge mode-${quote.calculationMode.toLowerCase()}`}>{quote.calculationMode === "LEGACY" ? "Legacy Quote" : "Pulse Quote"}</em></span>
          <h1>{quote.title}</h1>
          <p>{quote.clientName || "Unlinked client"} · {quote.context.requestNumber || "Manual quote"}</p>
        </div>
        <div className="quote-header-actions lifecycle-record-actions">
          <select
            className="lifecycle-record-status"
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
          {revisionEligibleStatuses.has(quote.status) ? (
            <button
              className="toolbar-button compact quote-revision-action"
              type="button"
              disabled={!canWrite || Boolean(quote.projectId)}
              title={quote.projectId ? "This approved quote is already linked to a project." : undefined}
              onClick={() => setRevisionDialogOpen(true)}
            >
              <RotateCcw size={16} />Request revision
            </button>
          ) : null}
          {quote.status === "Draft" && !quote.projectId ? (
            <button
              className="toolbar-button compact"
              type="button"
              disabled={!canWrite || busy}
              onClick={() => requestModeChange(quote.calculationMode === "LEGACY" ? "PULSE" : "LEGACY")}
            >
              Switch to {quote.calculationMode === "LEGACY" ? "Pulse" : "Legacy"}
            </button>
          ) : null}
          {quote.status === "Approved" && !quote.projectId ? (
            <button className="primary-button compact" type="button" disabled={!canWrite || busy} onClick={() => setProjectConversionOpen(true)}>Convert to project</button>
          ) : null}
          {quote.calculationMode === "PULSE" ? <>
            <button className="toolbar-button compact" type="button" onClick={() => setAdHocOpen(true)} disabled={!canWrite}><Plus size={16} />Ad hoc line</button>
            <button className="primary-button compact" type="button" onClick={() => setAddOpen(true)} disabled={!canWrite}><PackagePlus size={16} />Add Item</button>
          </> : null}
        </div>
      </header>

      <section className="quote-context-grid lifecycle-key-details" aria-label="Quote context">
        <article><span>Request</span><strong>{quote.context.requestNumber || "Manual quote"}</strong><p>{quote.context.requestTitle || quote.title}</p></article>
        <article className={quote.clientId ? "quote-context-linked lifecycle-client-key" : undefined}>
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
        <article className={quote.clientId && quote.contact ? "quote-context-linked" : undefined}>
          {quote.clientId && quote.contact ? (
            <Link href={`/clients/${quote.clientId}`} aria-label={`Open ${quote.contact.name} on the ${quote.clientName} client profile`}>
              <span>Point of Contact</span>
              <strong>{quote.contact.name || quote.context.contactName || "Not captured"}</strong>
              <p>
                {[
                  quote.contact.title || quote.contact.role,
                  quote.contact.department,
                  quote.contact.email || quote.contact.phone || quote.contact.mobile
                ].filter(Boolean).join(" · ") || "No contact details"}
              </p>
            </Link>
          ) : (
            <>
              <span>Point of Contact</span>
              <strong>{quote.context.contactName || "Not captured"}</strong>
              <p>{quote.context.contactEmail || quote.context.contactPhone || "No linked client contact"}</p>
            </>
          )}
        </article>
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

      {quote.relationshipWarnings.map((warning) => (
        <div key={`${warning.field}:${warning.legacyValue}`} className="request-record-alert" role="status">
          <AlertTriangle size={18} />
          <span>{warning.message} <strong>{warning.legacyValue}</strong></span>
        </div>
      ))}

      <div className="request-supporting-tabs work-record-tabs lifecycle-tabs quote-lifecycle-tabs" role="tablist" aria-label="Quote workspace sections">
        {(["work", "details", "files", "updates"] as LifecycleTab[]).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} onClick={() => selectTab(tab)}>
            {tab[0].toUpperCase() + tab.slice(1)}
            {tab === "files" && quote.documents.length ? <span>{quote.documents.length}</span> : null}
            {tab === "updates" && quote.unreadMentionCount ? <span>{quote.unreadMentionCount}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === "details" ? (
        <section className="lifecycle-details-panel quote-lifecycle-details">
          <div className="panel-header">
            <div><h2>Details</h2><p className="panel-note">Stage links, request context, and one shared note across the lifecycle.</p></div>
            {detailsEditing ? (
              <div className="settings-inline-actions"><button className="toolbar-button compact" type="button" onClick={() => { setDetailsEditing(false); setDetailsDraft(quote.lifecycleContext.details); }}>Cancel</button><button className="primary-button compact" type="button" disabled={busy} onClick={() => void saveLifecycleDetails()}><Save size={15} />Save</button></div>
            ) : <button className="toolbar-button compact" type="button" disabled={!canWrite} onClick={() => setDetailsEditing(true)}>Edit note</button>}
          </div>
          <div className="request-details-grid lifecycle-linked-grid">
            <section><span>Client</span><h3>{quote.clientId ? <Link href={`/clients/${quote.clientId}`}>{quote.clientName}</Link> : quote.clientName || "Not linked"}</h3><p>Linked for this quote stage</p></section>
            <section><span>Point of contact</span><h3>{quote.contact?.name || quote.context.contactName || "Not linked"}</h3><p>{quote.contact?.email || quote.context.contactEmail || "No contact method"}</p></section>
            <section><span>Site</span><h3>{quote.site?.siteName || quote.context.siteName || "Not linked"}</h3><p>{quote.site ? [quote.site.address, quote.site.city, quote.site.state].filter(Boolean).join(", ") : quote.context.siteAddress || "No site"}</p></section>
            <section className="lifecycle-assignee-card"><span>Assigned person</span><select aria-label="Assigned person" value={quote.assignedToId ?? ""} disabled={!canWrite || busy} onChange={(event) => void assignQuotePerson(event.target.value)}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.roleLabel}</option>)}</select><p>Changes apply immediately to this quote.</p></section>
          </div>
          <label className="material-field lifecycle-details-note"><span>Shared lifecycle details</span>{detailsEditing ? <textarea maxLength={5000} value={detailsDraft} onChange={(event) => setDetailsDraft(event.target.value)} /> : <p>{quote.lifecycleContext.details || "No shared details have been added."}</p>}<small>{detailsEditing ? `${detailsDraft.length}/5,000` : `Last updated by ${quote.lifecycleContext.updatedByName}`}</small></label>
        </section>
      ) : null}

      {activeTab === "details" ? <section className="quote-version-history" aria-labelledby="quote-version-history-heading">
        <div className="panel-header">
          <div>
            <h2 id="quote-version-history-heading">Version history</h2>
            <p className="panel-note">One quote lifecycle, including every client-requested revision.</p>
          </div>
          <span className="quote-version-count"><History size={15} />{quote.revisionNumber} revision{quote.revisionNumber === 1 ? "" : "s"}</span>
        </div>
        <ol className="quote-version-list">
          {[...quote.versions].sort((left, right) => right.revisionNumber - left.revisionNumber).map((version) => (
            <li key={version.id} className={version.isCurrent ? "is-current" : ""}>
              <span className="quote-version-marker" aria-hidden="true"><i /></span>
              <div className="quote-version-copy">
                <div className="quote-version-heading">
                  <div>
                    <strong>{version.quoteNumber}</strong>
                    <span>{version.isCurrent ? "Current version" : `${version.priorStatus || "Sent"} → Revision Requested`}</span>
                  </div>
                  <div className="quote-version-badges">
                    {version.precision === "ESTIMATED" ? <em>Estimated history</em> : null}
                    <b>{version.outcome}</b>
                  </div>
                </div>
                <div className="quote-version-dates">
                  <span><Clock3 size={13} />Opened {compactDate(version.versionCreatedAt)}</span>
                  {version.sentAt ? <span>Sent {compactDate(version.sentAt)}</span> : null}
                  {version.requestedAt ? <span>Returned {compactDate(version.requestedAt)}</span> : null}
                </div>
                {!version.isCurrent ? <p>{version.reason || "No revision reason was captured."}</p> : null}
              </div>
              {!version.isCurrent ? (
                <button
                  className="toolbar-button compact"
                  type="button"
                  disabled={historyLoadingVersion !== null}
                  onClick={() => void openHistoricalVersion(version)}
                >
                  <Eye size={15} />{historyLoadingVersion === version.revisionNumber ? "Loading…" : "View"}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section> : null}

      {activeTab === "updates" ? <QuoteUpdatesPanel
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
      /> : null}

      {activeTab === "work" && quote.status === "Draft" && !quote.projectId && financiallyEmpty ? (
        <section className="quote-empty-mode-selector" aria-labelledby="empty-quote-mode-heading">
          <div><span>Calculation setup</span><h2 id="empty-quote-mode-heading">How should this quote be built?</h2><p>You can switch freely while this draft remains financially empty.</p></div>
          <div className="quote-mode-options">
            {([
              ["LEGACY", "Legacy Quote", "Enter summarized values calculated outside Pulse."],
              ["PULSE", "Pulse Quote", "Build and calculate the quote using Pulse line items."]
            ] as const).map(([mode, label, description]) => (
              <button
                className={`quote-mode-option${quote.calculationMode === mode ? " selected" : ""}`}
                type="button"
                key={mode}
                disabled={!canWrite || busy || quote.calculationMode === mode}
                onClick={() => requestModeChange(mode)}
              >
                <span><strong>{label}</strong><small>{description}</small></span>
                {quote.calculationMode === mode ? <em>Selected</em> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "work" ? <div className="quote-workspace-grid lifecycle-work-grid">
        {quote.calculationMode === "LEGACY" && legacyFinancialDraft ? (
          <form className="quote-bom-panel quote-legacy-panel" onSubmit={saveLegacyFinancials}>
            <div className="panel-header">
              <div><h2>Legacy financial summary</h2><p className="panel-note">Enter the summarized sale and cost values calculated outside Pulse.</p></div>
              <span className="quote-mode-badge mode-legacy">Business days</span>
            </div>
            <div className="legacy-financial-groups">
              {([
                ["Sales", [["materialSale", "Material sale"], ["laborSale", "Labor sale"]]],
                ["Costs", [["materialCost", "Material cost"], ["laborCost", "Labor cost"]]],
                ["Tax", [["taxAmount", "Tax amount"]]],
                ["Schedule", [["estimatedDurationBusinessDays", "Estimated duration"]]]
              ] as const).map(([group, fields]) => (
                <fieldset key={group}>
                  <legend>{group}</legend>
                  {fields.map(([field, label]) => (
                    <label className="material-field" key={field}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        step={field === "estimatedDurationBusinessDays" ? "1" : "0.01"}
                        inputMode={field === "estimatedDurationBusinessDays" ? "numeric" : "decimal"}
                        value={legacyFinancialDraft[field]}
                        disabled={!canWrite || busy}
                        required={field !== "estimatedDurationBusinessDays"}
                        onChange={(event) => setLegacyFinancialDraft({ ...legacyFinancialDraft, [field]: event.target.value })}
                      />
                      {field === "estimatedDurationBusinessDays" ? <small>Optional whole business days</small> : <small>USD</small>}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="legacy-financial-actions">
              <p>Markup and margin are calculated from sale and cost values. Tax remains separate.</p>
              <button className="primary-button compact" type="submit" disabled={!canWrite || busy}><Save size={15} />{busy ? "Saving…" : "Save financials"}</button>
            </div>
          </form>
        ) : (
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
        )}

        <aside className="quote-summary-rail">
          <section className="quote-total-card">
            <span>Financial summary</span>
            <strong>{formatMoney(quote.financialSummary.finalCustomerTotal)}</strong>
            <p>{quote.calculationMode === "PULSE" ? `${quote.items.length} BOM line${quote.items.length === 1 ? "" : "s"}` : "Summary-based quote"}</p>
            <SummaryMetrics summary={quote.financialSummary} />
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
      </div> : null}

      {activeTab === "files" ? (
        <section className="work-record-surface request-supporting-panel">
          <LifecycleDocuments
            stage="quote"
            recordId={quote.id}
            documents={quote.documents}
            canWrite={canWrite}
            onChange={(documents) => setQuote((current) => current ? { ...current, documents } : current)}
          />
        </section>
      ) : null}

      {revisionDialogOpen ? (
        <ViewportPortal>
          <div className="client-create-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !revisionBusy) setRevisionDialogOpen(false); }}>
          <form className="client-create-dialog quote-revision-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-revision-dialog-title" onSubmit={requestRevision}>
            <div className="client-create-dialog-header">
              <div><span className="dashboard-eyebrow">Client lifecycle</span><h3 id="quote-revision-dialog-title">Open {quote.baseQuoteNumber}R{quote.revisionNumber + 1}</h3><p>Preserve {quote.quoteNumber} as read-only history and continue this same quote as a new draft.</p></div>
              <button className="icon-button" type="button" aria-label="Close" disabled={revisionBusy} onClick={() => setRevisionDialogOpen(false)}><X size={18} /></button>
            </div>
            <div className="quote-revision-summary">
              <RotateCcw size={20} />
              <div><strong>{quote.status} → Revision Requested → Draft</strong><span>The prior client outcome will be superseded for lifecycle analysis, while remaining visible in the audit history.</span></div>
            </div>
            <label className="material-field">
              <span>Changes requested by the client</span>
              <textarea
                autoFocus
                required
                maxLength={2000}
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                placeholder="Describe what the client asked to change…"
              />
              <small>{revisionReason.trim().length}/2,000 · Required</small>
            </label>
            <div className="client-create-dialog-actions">
              <button className="toolbar-button compact" type="button" disabled={revisionBusy} onClick={() => setRevisionDialogOpen(false)}>Cancel</button>
              <button className="primary-button compact" type="submit" disabled={revisionBusy || !revisionReason.trim()}><RotateCcw size={15} />{revisionBusy ? "Opening revision…" : "Open revision"}</button>
            </div>
          </form>
          </div>
        </ViewportPortal>
      ) : null}

      {selectedVersion ? (
        <ViewportPortal>
          <div className="client-create-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVersion(null); }}>
          <section className="client-create-dialog quote-version-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-version-dialog-title">
            <div className="client-create-dialog-header">
              <div><span className="dashboard-eyebrow">Read-only quote version</span><h3 id="quote-version-dialog-title">{selectedVersion.revision.quoteNumber}</h3><p>{selectedVersion.revision.title}</p></div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setSelectedVersion(null)}><X size={18} /></button>
            </div>
            <div className="quote-version-readonly-banner">
              <History size={18} />
              <div><strong>{selectedVersion.revision.priorStatus || "Sent"} → Revision Requested</strong><span>This snapshot cannot be edited. {selectedVersion.revision.precision === "ESTIMATED" ? "Dates were reconstructed from the legacy import." : "Dates were captured by Pulse."}</span></div>
            </div>
            <dl className="quote-version-facts">
              <div><dt>Owner</dt><dd>{selectedVersion.revision.owner}</dd></div>
              <div><dt>Total</dt><dd>{formatMoney(selectedVersion.revision.total)}</dd></div>
              <div><dt>Sent</dt><dd>{selectedVersion.revision.sentAt ? compactDate(selectedVersion.revision.sentAt) : "Not available"}</dd></div>
              <div><dt>Returned</dt><dd>{compactDate(selectedVersion.revision.requestedAt)}</dd></div>
            </dl>
            <section className="quote-version-reason">
              <span>Client revision request</span>
              <p>{selectedVersion.revision.reason || "No revision reason was captured."}</p>
            </section>
            {!selectedVersion.revision.dataAvailable ? (
              <div className="work-queue-state">The original quote content was not included in the legacy import. Its lifecycle placeholder is retained for accurate revision counts.</div>
            ) : (
              <>
                <section className="quote-version-context">
                  <article><span>Request</span><strong>{selectedVersion.context.requestNumber || "Manual quote"}</strong><p>{selectedVersion.context.requestTitle || selectedVersion.revision.title}</p></article>
                  <article className={selectedVersion.clientId && selectedVersion.contact ? "quote-context-linked" : undefined}>
                    {selectedVersion.clientId && selectedVersion.contact ? (
                      <Link
                        href={`/clients/${selectedVersion.clientId}`}
                        aria-label={`Open ${selectedVersion.contact.name} on the ${selectedVersion.clientName} client profile`}
                      >
                        <span>Point of Contact</span>
                        <strong>{selectedVersion.contact.name || selectedVersion.context.contactName || "Not captured"}</strong>
                        <p>
                          {[
                            selectedVersion.contact.title || selectedVersion.contact.role,
                            selectedVersion.contact.department,
                            selectedVersion.contact.email ||
                              selectedVersion.contact.phone ||
                              selectedVersion.contact.mobile
                          ].filter(Boolean).join(" · ") || "No contact method"}
                        </p>
                      </Link>
                    ) : (
                      <>
                        <span>Point of Contact</span>
                        <strong>{selectedVersion.context.contactName || "Not captured"}</strong>
                        <p>{selectedVersion.context.contactEmail || selectedVersion.context.contactPhone || "No linked client contact"}</p>
                      </>
                    )}
                  </article>
                  <article><span>Site</span><strong>{selectedVersion.context.siteName || "Not captured"}</strong><p>{[selectedVersion.context.siteAddress, selectedVersion.context.city, selectedVersion.context.state].filter(Boolean).join(", ") || "No site snapshot"}</p></article>
                </section>
                <section className="quote-version-notes-grid">
                  <article><span>Scope snapshot</span><p>{selectedVersion.context.scopeDescription || "No scope was captured."}</p></article>
                  <article><span>Proposal notes</span><p>{selectedVersion.proposalNotes || "No proposal notes were captured."}</p></article>
                </section>
                {selectedVersion.calculationMode === "LEGACY" ? (
                  <section className="quote-version-bom">
                    <div className="panel-header"><div><h2>Legacy financial summary</h2><p className="panel-note">Immutable values captured for this version.</p></div><span className="quote-mode-badge mode-legacy">Legacy Quote</span></div>
                    <SummaryMetrics summary={selectedVersion.financialSummary} />
                  </section>
                ) : (
                  <section className="quote-version-bom">
                    <div className="panel-header"><div><h2>Bill of Materials</h2><p className="panel-note">Snapshot at the time the client returned this version.</p></div><strong>{formatMoney(selectedVersion.revision.total)}</strong></div>
                    <div className="quote-version-table-frame">
                      <table className="data-table">
                        <thead><tr><th>Item</th><th>Section</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
                        <tbody>
                          {selectedVersion.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><br /><span className="table-muted">{item.sku || item.partNumber || item.description || item.itemType}</span></td><td>{item.section}</td><td>{item.quantity} {item.unitOfMeasure}</td><td>{formatMoney(item.unitPrice)}</td><td><strong>{formatMoney(item.lineTotal)}</strong></td></tr>)}
                          {!selectedVersion.items.length ? <tr><td colSpan={5}><div className="quote-empty-section"><Boxes size={18} />No BOM lines were captured for this version.</div></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
            <div className="client-create-dialog-actions"><button className="primary-button compact" type="button" onClick={() => setSelectedVersion(null)}>Close history</button></div>
          </section>
          </div>
        </ViewportPortal>
      ) : null}

      {modeDialogOpen && targetMode ? (
        <ViewportPortal>
          <div className="record-dialog-backdrop">
            <section className="record-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-mode-change-title">
              <div className="record-dialog-heading">
                <span><AlertTriangle size={19} /></span>
                <div>
                  <h2 id="quote-mode-change-title">Discard quote financial data?</h2>
                  <p>Switching to {targetMode === "LEGACY" ? "Legacy Quote" : "Pulse Quote"} removes {quote.calculationMode === "PULSE" ? "all QuoteItems" : "the Legacy sale, cost, tax, and duration values"}.</p>
                </div>
                <button type="button" aria-label="Close dialog" onClick={() => setModeDialogOpen(false)}><X size={19} /></button>
              </div>
              <div className="record-conversion-summary">
                <strong>No automatic conversion will be attempted.</strong>
                <span>This action is available only while the quote is a draft and is not connected to a project.</span>
              </div>
              <div className="record-dialog-actions">
                <button type="button" onClick={() => setModeDialogOpen(false)}>Keep current mode</button>
                <button className="danger" type="button" disabled={busy} onClick={() => void changeCalculationModeFor(targetMode, true)}>{busy ? "Switching…" : "Discard data and switch"}</button>
              </div>
            </section>
          </div>
        </ViewportPortal>
      ) : null}

      {projectConversionOpen ? (
        <ViewportPortal>
          <div className="record-dialog-backdrop">
            <section className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-project-conversion-title">
              <div className="record-dialog-heading">
                <span className="success"><FileText size={19} /></span>
                <div><h2 id="quote-project-conversion-title">Convert approved quote?</h2><p>The project will use the pre-tax contract value as its operating budget.</p></div>
                <button type="button" aria-label="Close dialog" onClick={() => setProjectConversionOpen(false)}><X size={19} /></button>
              </div>
              <div className="record-conversion-summary">
                <strong>{formatMoney(quote.financialSummary.preTaxContractValue)} project budget</strong>
                <span>{formatMoney(quote.financialSummary.taxAmount)} tax remains separate · {formatMoney(quote.financialSummary.finalCustomerTotal)} customer total</span>
                <p>No due date is inferred from estimated duration without a confirmed start date.</p>
              </div>
              <div className="record-dialog-actions">
                <button type="button" onClick={() => setProjectConversionOpen(false)}>Cancel</button>
                <button className="primary" type="button" disabled={busy} onClick={() => void convertToProject()}>{busy ? "Converting…" : "Create project"}</button>
              </div>
            </section>
          </div>
        </ViewportPortal>
      ) : null}

      {addOpen ? (
        <ViewportPortal>
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
        </ViewportPortal>
      ) : null}

      {adHocOpen ? (
        <ViewportPortal>
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
        </ViewportPortal>
      ) : null}

      {toast ? <ViewportPortal><div className="work-queue-toast" role="status">{toast}</div></ViewportPortal> : null}
    </section>
  );
}
