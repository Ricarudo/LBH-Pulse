"use client";

import { AlertTriangle, Building2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClientMergePreview, ClientRecord } from "@pulse/contracts/clients";
import { apiFetch } from "@/lib/api/client";

type Props = {
  currentClient: ClientRecord;
  onCancel: () => void;
  onMerged: (client: ClientRecord) => void;
};

type ClientListResponse = { clients: ClientRecord[] };
type PreviewResponse = { preview: ClientMergePreview };
type MergeResponse = { client: ClientRecord; mergedClientIds: string[] };

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await apiFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Client merge request failed.");
  }
  return data as T;
}

export function ClientMergeDialog({ currentClient, onCancel, onMerged }: Props) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([currentClient.id]);
  const [masterId, setMasterId] = useState(currentClient.id);
  const [globalDisplayName, setGlobalDisplayName] = useState(currentClient.displayName);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(
    currentClient.primaryContact.id || null
  );
  const [primarySiteId, setPrimarySiteId] = useState<string | null>(
    currentClient.sites.find((site) => site.isPrimarySite)?.id ?? currentClient.sites[0]?.id ?? null
  );
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<ClientMergePreview | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    void requestJson<ClientListResponse>("/api/clients", { cache: "no-store" })
      .then((data) => setClients(data.clients))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load clients."))
      .finally(() => setIsLoading(false));
  }, []);

  const selectedClients = useMemo(
    () => clients.filter((client) => selectedIds.includes(client.id)),
    [clients, selectedIds]
  );
  const availableClients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return clients.filter(
      (client) =>
        client.id !== currentClient.id &&
        !selectedIds.includes(client.id) &&
        (!normalized ||
          [client.clientNumber, client.displayName, client.legalName, ...client.aliases.map((alias) => alias.name)]
            .join(" ")
            .toLowerCase()
            .includes(normalized))
    );
  }, [clients, currentClient.id, search, selectedIds]);

  function payload() {
    return {
      clientIds: selectedIds,
      masterId,
      globalDisplayName,
      primaryContactId,
      primarySiteId,
      expectedUpdatedAt: Object.fromEntries(
        selectedClients.map((client) => [client.id, client.updatedAt])
      )
    };
  }

  function selectClient(client: ClientRecord) {
    setSelectedIds((current) => [...current, client.id]);
    setPreview(null);
    setSearch("");
  }

  function removeClient(id: string) {
    if (id === currentClient.id) return;
    const next = selectedIds.filter((clientId) => clientId !== id);
    setSelectedIds(next);
    if (masterId === id) {
      setMasterId(currentClient.id);
      setGlobalDisplayName(currentClient.displayName);
    }
    setPreview(null);
  }

  function chooseMaster(id: string) {
    setMasterId(id);
    const master = clients.find((client) => client.id === id);
    if (master) setGlobalDisplayName(master.displayName);
    setPreview(null);
  }

  async function reviewMerge() {
    try {
      setIsPreviewing(true);
      setError("");
      const data = await requestJson<PreviewResponse>("/api/clients/merge/preview", {
        method: "POST",
        body: JSON.stringify(payload())
      });
      setPreview(data.preview);
      const master = selectedClients.find((client) => client.id === masterId);
      const masterPrimaryContact =
        master?.contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact) ??
        data.preview.contacts[0];
      const masterPrimarySite =
        master?.sites.find((site) => site.isPrimarySite) ?? master?.sites[0] ?? data.preview.sites[0];
      setPrimaryContactId((current) =>
        current && data.preview.contacts.some((contact) => contact.id === current)
          ? current
          : masterPrimaryContact?.id ?? null
      );
      setPrimarySiteId((current) =>
        current && data.preview.sites.some((site) => site.id === current)
          ? current
          : masterPrimarySite?.id ?? null
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to review this merge.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function confirmMerge() {
    if (
      !preview ||
      (preview.contacts.length > 0 && !primaryContactId) ||
      (preview.sites.length > 0 && !primarySiteId)
    ) {
      setError("Choose the primary contact and site before combining these clients.");
      return;
    }
    if (!window.confirm("This merge is permanent. The non-master clients will be archived and redirected to the master. Continue?")) {
      return;
    }
    try {
      setIsMerging(true);
      setError("");
      const data = await requestJson<MergeResponse>("/api/clients/merge", {
        method: "POST",
        body: JSON.stringify(payload())
      });
      onMerged(data.client);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to combine these clients.");
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="client-merge-backdrop" role="presentation">
      <section className="client-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="client-merge-title">
        <header className="client-merge-heading">
          <div>
            <span>Administrator action</span>
            <h2 id="client-merge-title">Combine clients</h2>
            <p>Select the records to consolidate, choose the master, and review every relationship before confirming.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close merge dialog" onClick={onCancel} disabled={isMerging}>
            <X size={18} />
          </button>
        </header>

        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="client-merge-grid">
          <section>
            <h3>Selected clients</h3>
            <div className="client-merge-selected">
              {(selectedClients.length ? selectedClients : [currentClient]).map((client) => (
                <article key={client.id}>
                  <label>
                    <input type="radio" name="mergeMaster" checked={masterId === client.id} onChange={() => chooseMaster(client.id)} />
                    <span><strong>{client.displayName}</strong><small>{client.clientNumber}</small></span>
                  </label>
                  {client.id !== currentClient.id ? (
                    <button type="button" className="icon-button" aria-label={`Remove ${client.displayName}`} onClick={() => removeClient(client.id)}>
                      <X size={15} />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>

            <label className="material-field">
              <span>Global display name</span>
              <input value={globalDisplayName} maxLength={160} onChange={(event) => { setGlobalDisplayName(event.target.value); setPreview(null); }} />
            </label>

            <label className="lead-search client-merge-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find another client..." />
            </label>
            {search ? (
              <div className="client-merge-results">
                {availableClients.slice(0, 8).map((client) => (
                  <button type="button" key={client.id} onClick={() => selectClient(client)}>
                    <Building2 size={16} />
                    <span><strong>{client.displayName}</strong><small>{client.clientNumber} · {client.legalName || "No legal name"}</small></span>
                  </button>
                ))}
                {!availableClients.length && !isLoading ? <p>No matching active clients.</p> : null}
              </div>
            ) : null}
          </section>

          <section>
            <h3>Merge review</h3>
            {preview ? (
              <>
                <div className="client-merge-counts">
                  {Object.entries(preview.counts).map(([label, count]) => (
                    <div key={label}><strong>{count}</strong><span>{label}</span></div>
                  ))}
                </div>
                <label className="material-field">
                  <span>Primary contact</span>
                  <select value={primaryContactId ?? ""} onChange={(event) => setPrimaryContactId(event.target.value || null)}>
                    {!preview.contacts.length ? <option value="">No contacts</option> : null}
                    {preview.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email || contact.phone || "No contact method"}</option>)}
                  </select>
                </label>
                <label className="material-field">
                  <span>Primary site</span>
                  <select value={primarySiteId ?? ""} onChange={(event) => setPrimarySiteId(event.target.value || null)}>
                    {!preview.sites.length ? <option value="">No sites</option> : null}
                    {preview.sites.map((site) => <option key={site.id} value={site.id}>{site.siteName} · {site.address || site.city || "No address"}</option>)}
                  </select>
                </label>
                <div className="client-merge-aliases">
                  <strong>Preserved aliases</strong>
                  <p>{preview.aliases.length ? preview.aliases.join(", ") : "No additional names."}</p>
                </div>
                {preview.duplicateWarnings.length ? (
                  <div className="client-merge-warnings">
                    <strong><AlertTriangle size={16} /> Possible duplicates kept</strong>
                    {preview.duplicateWarnings.map((warning) => (
                      <p key={`${warning.kind}-${warning.recordIds.join("-")}`}>{warning.label}: {warning.reason}</p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="client-merge-empty">
                <Building2 size={28} />
                <p>Select at least two clients, then generate a merge review.</p>
              </div>
            )}
          </section>
        </div>

        <footer className="client-merge-actions">
          <button type="button" className="toolbar-button" onClick={onCancel} disabled={isMerging}>Cancel</button>
          {!preview ? (
            <button type="button" className="primary-button" disabled={selectedIds.length < 2 || !globalDisplayName.trim() || isPreviewing} onClick={reviewMerge}>
              {isPreviewing ? "Reviewing..." : "Review merge"}
            </button>
          ) : (
            <button type="button" className="primary-button" disabled={isMerging} onClick={confirmMerge}>
              {isMerging ? "Combining..." : "Combine clients"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
