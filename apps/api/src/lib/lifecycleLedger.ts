export type LifecycleLedgerEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  source: string;
  precision: string;
  actorUserId?: string | null;
  actorNameSnapshot?: string;
  valueSnapshot?: unknown;
  metadata?: unknown;
  disposition?: { status: string } | null;
};

export type LifecycleLedgerIssue = {
  type: "exact-duplicate" | "chain-break" | "ambiguous-timestamp-tie" | "timestamp-tie-resolved" | "current-status-disagreement" | "reviewed-event-excluded";
  eventIds: string[];
  at: Date | null;
  detail: string;
  deterministic: boolean;
};

export type LifecycleLedgerResolution<TEvent extends LifecycleLedgerEvent> = {
  canonicalEvents: TEvent[];
  excludedEvents: Array<{ event: TEvent; reason: string }>;
  issues: LifecycleLedgerIssue[];
  unreliableFrom: Date | null;
  currentStatusAgreement: boolean;
  deterministic: boolean;
};

const excludedDispositions = new Set(["DUPLICATE", "INVALID", "SUPERSEDED"]);

function stable(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    if ("toJSON" in value && typeof value.toJSON === "function") return stable(value.toJSON());
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function lifecycleEventIdentity(event: LifecycleLedgerEvent) {
  return stable({
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    changedAt: event.changedAt,
    source: event.source,
    precision: event.precision,
    actorUserId: event.actorUserId ?? null,
    actorNameSnapshot: event.actorNameSnapshot ?? null,
    valueSnapshot: event.valueSnapshot ?? null,
    metadata: event.metadata ?? null
  });
}

function validSequences<TEvent extends LifecycleLedgerEvent>(events: TEvent[], initialStatus: string | null) {
  const results: TEvent[][] = [];
  function visit(remaining: TEvent[], state: string | null, sequence: TEvent[]) {
    if (!remaining.length) {
      results.push(sequence);
      return;
    }
    for (const [index, event] of remaining.entries()) {
      if (state !== null && event.fromStatus !== state) continue;
      if (state === null && sequence.length === 0 && events.some((candidate) => candidate.fromStatus === null) && event.fromStatus !== null) continue;
      visit(
        remaining.filter((_, candidateIndex) => candidateIndex !== index),
        event.toStatus,
        [...sequence, event]
      );
      if (results.length > 1) return;
    }
  }
  visit(events, initialStatus, []);
  return results;
}

export function resolveLifecycleLedger<TEvent extends LifecycleLedgerEvent>(
  inputEvents: TEvent[],
  currentStatus: string
): LifecycleLedgerResolution<TEvent> {
  const issues: LifecycleLedgerIssue[] = [];
  const excludedEvents: Array<{ event: TEvent; reason: string }> = [];
  const eligible = inputEvents
    .filter((event) => {
      if (!event.disposition || !excludedDispositions.has(event.disposition.status)) return true;
      excludedEvents.push({ event, reason: `reviewed-${event.disposition.status.toLowerCase()}` });
      issues.push({
        type: "reviewed-event-excluded",
        eventIds: [event.id],
        at: event.changedAt,
        detail: `A reviewed ${event.disposition.status.toLowerCase()} event was excluded from the canonical ledger.`,
        deterministic: true
      });
      return false;
    })
    .sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime() || left.id.localeCompare(right.id));

  const deduplicated: TEvent[] = [];
  const byIdentity = new Map<string, TEvent>();
  for (const event of eligible) {
    const identity = lifecycleEventIdentity(event);
    const original = byIdentity.get(identity);
    if (!original) {
      byIdentity.set(identity, event);
      deduplicated.push(event);
      continue;
    }
    excludedEvents.push({ event, reason: `exact-duplicate-of:${original.id}` });
    issues.push({
      type: "exact-duplicate",
      eventIds: [original.id, event.id],
      at: event.changedAt,
      detail: "Identity and payload are equivalent; the later ID is ignored by analytics.",
      deterministic: true
    });
  }

  const groups = new Map<number, TEvent[]>();
  for (const event of deduplicated) {
    const timestamp = event.changedAt.getTime();
    groups.set(timestamp, [...(groups.get(timestamp) ?? []), event]);
  }
  const canonicalEvents: TEvent[] = [];
  let state: string | null = null;
  let unreliableFrom: Date | null = null;
  for (const [timestamp, group] of [...groups.entries()].sort(([left], [right]) => left - right)) {
    const ordered: TEvent[][] = group.length === 1 ? [group] : validSequences(group, state);
    if (ordered.length !== 1) {
      unreliableFrom = new Date(timestamp);
      issues.push({
        type: "ambiguous-timestamp-tie",
        eventIds: group.map((event) => event.id),
        at: unreliableFrom,
        detail: "Events sharing a timestamp do not have one provable chain order.",
        deterministic: false
      });
      break;
    }
    if (group.length > 1) {
      issues.push({
        type: "timestamp-tie-resolved",
        eventIds: ordered[0].map((event) => event.id),
        at: new Date(timestamp),
        detail: "A single status-compatible order resolved the timestamp tie.",
        deterministic: true
      });
    }
    for (const event of ordered[0]) {
      if (state !== null && event.fromStatus !== state) {
        unreliableFrom = event.changedAt;
        issues.push({
          type: "chain-break",
          eventIds: [canonicalEvents.at(-1)?.id, event.id].filter((id): id is string => Boolean(id)),
          at: event.changedAt,
          detail: `Expected fromStatus ${state}, received ${event.fromStatus ?? "null"}.`,
          deterministic: false
        });
        break;
      }
      canonicalEvents.push(event);
      state = event.toStatus;
    }
    if (unreliableFrom) break;
  }

  const finalEvent = canonicalEvents.at(-1);
  const currentStatusAgreement = !finalEvent || finalEvent.toStatus === currentStatus;
  if (!currentStatusAgreement) {
    issues.push({
      type: "current-status-disagreement",
      eventIds: [finalEvent!.id],
      at: finalEvent!.changedAt,
      detail: `Canonical event status ${finalEvent!.toStatus} differs from current entity status ${currentStatus}.`,
      deterministic: false
    });
    if (!unreliableFrom) unreliableFrom = finalEvent!.changedAt;
  }

  return {
    canonicalEvents,
    excludedEvents,
    issues,
    unreliableFrom,
    currentStatusAgreement,
    deterministic: issues.every((issue) => issue.deterministic)
  };
}
