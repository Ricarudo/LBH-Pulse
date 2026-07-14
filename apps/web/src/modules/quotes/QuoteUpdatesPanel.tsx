"use client";

import {
  AtSign,
  CalendarClock,
  CheckCircle2,
  Send,
  UserRound,
  X
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  completeQuoteUpdate,
  fetchQuoteUpdates,
  fetchQuoteUpdateTeamMembers,
  markQuoteMentionsRead,
  postQuoteUpdate,
  undoQuoteUpdate,
  type QuoteUpdatesResponse
} from "@/lib/api/quotes";
import { formatWorkspaceDate } from "@/lib/formatting";
import {
  requestUpdateFilters,
  type RequestAssignee,
  type RequestUpdate,
  type RequestUpdateFilter
} from "@pulse/contracts/requests";

type Props = {
  quoteId: string;
  initialUpdates: RequestUpdate[];
  initialCurrentStep: RequestUpdate | null;
  unreadMentionCount: number;
  canWrite: boolean;
  onChange: (state: QuoteUpdatesResponse) => void;
  onToast: (message: string) => void;
};

function formatDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

export function QuoteUpdatesPanel({
  quoteId,
  initialUpdates,
  initialCurrentStep,
  unreadMentionCount,
  canWrite,
  onChange,
  onToast
}: Props) {
  const [updates, setUpdates] = useState(initialUpdates);
  const [currentStep, setCurrentStep] = useState(initialCurrentStep);
  const [filter, setFilter] = useState<RequestUpdateFilter>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<RequestAssignee[]>([]);
  const [body, setBody] = useState("");
  const [isStep, setIsStep] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [undoAction, setUndoAction] = useState<{ id: string; label: string } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setUpdates(initialUpdates);
    setCurrentStep(initialCurrentStep);
  }, [initialCurrentStep, initialUpdates]);

  useEffect(() => {
    void fetchQuoteUpdateTeamMembers({ cache: "no-store" })
      .then((data) => setTeamMembers(data.teamMembers))
      .catch(() => setTeamMembers([]));
  }, []);

  useEffect(() => {
    if (!unreadMentionCount) return;
    void markQuoteMentionsRead(quoteId).catch(() => undefined);
  }, [quoteId, unreadMentionCount]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchQuoteUpdates(quoteId, filter, null, { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        setUpdates(data.updates);
        setCurrentStep(data.currentStep);
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      })
      .catch(() => {
        if (!cancelled) setUpdates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filter, quoteId]);

  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return teamMembers
      .filter((member) => member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query))
      .slice(0, 5);
  }, [mentionQuery, teamMembers]);

  function applyState(data: QuoteUpdatesResponse) {
    setUpdates(data.updates);
    setCurrentStep(data.currentStep);
    setCursor(data.nextCursor);
    setHasMore(data.hasMore);
    setFilter("all");
    onChange(data);
  }

  function changeBody(value: string) {
    setBody(value);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
    setMentionQuery(match ? match[1] : null);
    setMentionIndex(0);
  }

  function insertMention(member: RequestAssignee) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(body);
    if (!match) return;
    const start = match.index + (match[0].startsWith(" ") ? 1 : 0);
    setBody(`${body.slice(0, start)}@${member.name} `);
    setMentionIds((current) => Array.from(new Set([...current, member.id])));
    setMentionQuery(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionSuggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionIndex((current) => (current + 1) % mentionSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertMention(mentionSuggestions[mentionIndex]);
    }
  }

  async function post(confirmed = false) {
    if (!canWrite || !body.trim() || posting) return;
    if (isStep && !assigneeId) {
      onToast("Choose a responsible assignee for the current step.");
      return;
    }
    if (isStep && currentStep && !confirmed) {
      setConfirmReplace(true);
      return;
    }
    try {
      setConfirmReplace(false);
      setPosting(true);
      const data = await postQuoteUpdate(quoteId, {
        kind: isStep ? "step" : "comment",
        title: "",
        body: body.trim(),
        assigneeId: isStep ? assigneeId : "",
        targetDate: isStep ? targetDate : "",
        mentionIds
      });
      applyState(data);
      if (isStep && data.currentStep) setUndoAction({ id: data.currentStep.id, label: "Undo step replacement" });
      setBody("");
      setIsStep(false);
      setAssigneeId("");
      setTargetDate("");
      setMentionIds([]);
      setMentionQuery(null);
      onToast(isStep ? "Current step posted." : "Update posted.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to post update.");
    } finally {
      setPosting(false);
    }
  }

  async function completeStep() {
    if (!currentStep || !canWrite) return;
    try {
      const completedId = currentStep.id;
      const data = await completeQuoteUpdate(quoteId, completedId);
      applyState(data);
      setUndoAction({ id: completedId, label: "Undo completion" });
      onToast("Current step completed.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to complete step.");
    }
  }

  async function undo() {
    if (!undoAction) return;
    try {
      applyState(await undoQuoteUpdate(quoteId, undoAction.id));
      setUndoAction(null);
      onToast("Update change undone.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to undo update.");
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    try {
      setLoading(true);
      const data = await fetchQuoteUpdates(quoteId, filter, cursor, { cache: "no-store" });
      setUpdates((current) => [...current, ...data.updates]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load older updates.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="quote-updates-workspace" aria-labelledby="quote-updates-heading">
      <div className="panel-header">
        <div>
          <h2 id="quote-updates-heading">Updates</h2>
          <p className="panel-note">Request history and quote work stay together in one immutable timeline.</p>
        </div>
        {unreadMentionCount ? <span className="quote-update-unread">{unreadMentionCount} unread mention{unreadMentionCount === 1 ? "" : "s"}</span> : null}
      </div>
      <div className="quote-updates-layout">
        <div className="quote-updates-compose-column">
          <section className="request-current-step-card">
            <div className="record-section-heading">
              <div><span>Current step</span><h2>{currentStep?.title || currentStep?.body || "No current step"}</h2></div>
              {currentStep ? <span className="request-step-status">Open</span> : null}
            </div>
            {currentStep ? (
              <>
                <p>{currentStep.body}</p>
                <div className="request-current-step-meta">
                  <span><UserRound size={14} /> {currentStep.assignee?.name || "Unassigned"}</span>
                  <span><CalendarClock size={14} /> {currentStep.targetDate ? formatDate(currentStep.targetDate) : "No target date"}</span>
                </div>
                <button className="request-step-complete-button" type="button" onClick={() => void completeStep()} disabled={!canWrite}>
                  <CheckCircle2 size={16} /> Complete step
                </button>
              </>
            ) : <p className="request-current-step-empty">Promote an update to keep the next responsible action visible on the quote.</p>}
          </section>
          <section className="request-update-composer">
            <label htmlFor="quote-update-body">
              Add an update
              <textarea
                ref={composerRef}
                id="quote-update-body"
                value={body}
                onChange={(event) => changeBody(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Share context, a decision, or what changed…"
                disabled={!canWrite || posting}
              />
            </label>
            <p className="request-update-supporting-text">Updates are immutable. Type @ to mention an active Pulse user.</p>
            {mentionSuggestions.length ? (
              <div className="request-mention-suggestions" role="listbox" aria-label="Mention suggestions">
                {mentionSuggestions.map((member, index) => (
                  <button type="button" role="option" aria-selected={index === mentionIndex} key={member.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)}>
                    <AtSign size={14} /><span><strong>{member.name}</strong><small>{member.email}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="request-update-composer-footer">
              <button type="button" className={isStep ? "request-update-chip active" : "request-update-chip"} aria-pressed={isStep} onClick={() => setIsStep((current) => !current)} disabled={!canWrite}>
                <CheckCircle2 size={14} /> Set as current step
              </button>
              <button className="primary" type="button" onClick={() => void post()} disabled={!canWrite || !body.trim() || posting}>
                <Send size={15} /> {posting ? "Posting…" : "Post update"}
              </button>
            </div>
            {isStep ? (
              <div className="request-step-fields">
                <label>Responsible assignee <span aria-hidden="true">*</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Choose a Pulse user</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                <label>Target date <span className="optional-label">Optional</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
              </div>
            ) : null}
          </section>
        </div>
        <div className="quote-updates-feed">
          <div className="request-updates-toolbar" role="tablist" aria-label="Update filters">
            {requestUpdateFilters.map((value) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1) + (value === "system" ? "" : "s")}
              </button>
            ))}
          </div>
          {updates.length ? (
            <ol className="request-update-list">
              {updates.map((update) => (
                <li key={update.id} className={`request-update-item kind-${update.kind}${update.stepStatus ? ` status-${update.stepStatus}` : ""}`}>
                  <div className="request-update-item-marker" aria-hidden="true">{update.kind === "step" ? <CheckCircle2 size={16} /> : update.kind === "comment" ? <AtSign size={16} /> : <CalendarClock size={16} />}</div>
                  <div className="request-update-item-content">
                    <div className="request-update-item-headline"><strong>{update.title}</strong><span className="request-update-item-status">{update.kind === "step" ? update.stepStatus : update.kind === "system" ? "System" : "Comment"}</span></div>
                    {update.body ? <p>{update.body}</p> : null}
                    <div className="request-update-item-meta">
                      <span className="quote-update-stage">{update.quoteId ? "Quote" : "Request"}</span>
                      <span>{update.author.name}</span>
                      <time dateTime={update.createdAt}>{formatWorkspaceDate(update.createdAt, true)}</time>
                      {update.kind === "step" && update.assignee ? <span>Assigned to {update.assignee.name}</span> : null}
                      {update.kind === "step" && update.targetDate ? <span>Target {formatDate(update.targetDate)}</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="activity-empty-state"><AtSign size={18} /><span>{loading ? "Loading updates…" : "No updates match this filter yet."}</span></div>}
          {hasMore ? <button className="request-updates-load-more" type="button" onClick={() => void loadMore()} disabled={loading}>{loading ? "Loading…" : "Load older updates"}</button> : null}
        </div>
      </div>
      {undoAction ? <div className="request-undo-snackbar" role="status"><span>{undoAction.label}</span><button type="button" onClick={() => void undo()}>Undo</button></div> : null}
      {confirmReplace && currentStep ? (
        <div className="record-dialog-backdrop">
          <section className="record-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-replace-step-title">
            <div className="record-dialog-heading"><span><CheckCircle2 size={19} /></span><div><h2 id="quote-replace-step-title">Replace the current step?</h2><p>The existing step remains in the lifecycle timeline as superseded.</p></div><button type="button" aria-label="Close dialog" onClick={() => setConfirmReplace(false)}><X size={19} /></button></div>
            <div className="record-conversion-summary request-supersession-summary"><strong>{currentStep.title || currentStep.body}</strong><span>Assigned to {currentStep.assignee?.name || "Unassigned"}</span></div>
            <div className="record-dialog-actions"><button type="button" onClick={() => setConfirmReplace(false)}>Keep current step</button><button className="danger" type="button" onClick={() => void post(true)} disabled={posting}>{posting ? "Replacing…" : "Replace current step"}</button></div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
