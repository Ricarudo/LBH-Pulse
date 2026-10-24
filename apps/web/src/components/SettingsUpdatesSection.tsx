"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { updateStageLabels, type UpdateApplyResponse, type UpdateJob, type UpdateStatus } from "@pulse/contracts/updates";

const active = (job: UpdateJob | null) => Boolean(job && !["succeeded", "failed", "recovered"].includes(job.stage));
async function json<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Unable to contact the update service.");
  return value as T;
}
export function SettingsUpdatesSection({ canApply }: { canApply: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const credential = useRef<UpdateApplyResponse | null>(null);
  const requestKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const value = await json<UpdateStatus>(await apiFetch("/api/system/updates"));
      setStatus(value); setError("");
      if (value.job && !active(value.job)) { credential.current = null; requestKey.current = null; sessionStorage.removeItem("pulse-update-job"); }
    } catch (e) {
      const saved = credential.current;
      if (!saved) { setError(e instanceof Error ? e.message : "Unable to load updates."); return; }
      try {
        const value = await json<{ job: UpdateJob }>(await fetch("/_pulse/status", { headers: { Authorization: `Bearer ${saved.statusToken}` }, cache: "no-store" }));
        setStatus(previous => previous ? { ...previous, job: value.job } : null);
        setError("");
      } catch { setError("Pulse is restarting. Reconnecting automatically…"); }
    }
  }, []);
  useEffect(() => {
    try { credential.current = JSON.parse(sessionStorage.getItem("pulse-update-job") || "null"); } catch { /* expired local status */ }
    void load(); const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer);
  }, [load]);
  async function check() {
    setBusy(true); setError("");
    try { setStatus(await json<UpdateStatus>(await apiFetch("/api/system/updates/check", { method: "POST" }))); }
    catch (e) { setError(e instanceof Error ? e.message : "Update check failed."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!status?.availableVersion) return;
    setBusy(true); setError(""); requestKey.current ??= crypto.randomUUID();
    try {
      const value = await json<UpdateApplyResponse>(await apiFetch("/api/system/updates/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: status.availableVersion, idempotencyKey: requestKey.current }) }));
      credential.current = value; sessionStorage.setItem("pulse-update-job", JSON.stringify(value));
      setStatus({ ...status, job: value.job, eligible: false }); setConfirming(false);
    } catch (e) { setError(e instanceof Error ? e.message : "The update could not start."); }
    finally { setBusy(false); }
  }
  return <div className="settings-content-stack">
    <section className="settings-card">
      <div className="settings-card-heading"><div className="settings-icon-box"><Download size={20} /></div><div><h2>Pulse updates</h2><p>Review and install stable releases for this installation.</p></div></div>
      {error ? <p className="settings-callout" role="status">{error}</p> : null}
      {!status ? <p>Loading update status…</p> : !status.managed ? <p className="settings-callout">In-app updates require a managed Docker installation. Use the Docker deployment guide to install or adopt Pulse.</p> : <>
        <dl className="settings-definition-grid"><div><dt>Installed version</dt><dd>{status.installedVersion}</dd></div><div><dt>Available version</dt><dd>{status.availableVersion ?? "No newer release found"}</dd></div><div><dt>Channel</dt><dd>Stable</dd></div><div><dt>Last checked</dt><dd>{status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString() : "Not checked yet"}</dd></div></dl>
        {status.error ? <p className="settings-callout">Release information is unavailable. Your current installation remains available.</p> : null}
        {!status.backupReady ? <p className="settings-callout">Export and escrow the installation’s recovery key before installing updates. Follow the Docker deployment guide to confirm this step.</p> : null}
        {status.reason === "INTERMEDIATE_RELEASE_REQUIRED" || status.reason === "SOURCE_LEDGER_MISMATCH" ? <p className="settings-callout">This release requires an intermediate upgrade or operator review of the installation.</p> : null}
        {status.releaseNotes ? <div><h3>Release notes</h3><p style={{ whiteSpace: "pre-wrap" }}>{status.releaseNotes}</p></div> : null}
        <div className="settings-form-actions"><button type="button" className="secondary-button" onClick={() => void check()} disabled={busy || active(status.job)}><RefreshCw size={16} /> Check for updates</button>{canApply ? <button type="button" className="primary-button" onClick={() => setConfirming(true)} disabled={busy || !status.eligible || active(status.job)}>Update Pulse</button> : null}</div>
        {confirming ? <div className="settings-callout" role="region" aria-label="Confirm update"><h3>Update to {status.availableVersion}?</h3><p>Pulse will be unavailable while it backs up your data, verifies recovery, and installs this release. Ask everyone to save their work before continuing. You can close this browser after the update starts.</p><div className="settings-form-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button><button type="button" className="primary-button" onClick={() => void apply()} disabled={busy}>{busy ? "Starting…" : "Back up and update"}</button></div></div> : null}
      </>}
    </section>
    {status?.job ? <section className="settings-card" aria-live="polite"><h2>{updateStageLabels[status.job.stage]}</h2><p>Pulse {status.job.releaseId} · Started by {status.job.actor.name}</p><p>{status.job.backupVerified ? "Recovery backup restored and verified." : "Backup and recovery checks run before migration."}</p>{status.job.recoveryRequired ? <p className="settings-callout">Pulse is staying in maintenance mode to protect your data. Use the Docker recovery guide with job <code>{status.job.id}</code>. Failed volumes are preserved.</p> : null}{status.job.error ? <p>Reference: <code>{status.job.error}</code></p> : null}<ol>{status.job.events.map((event,index) => <li key={`${event.at}-${index}`}>{updateStageLabels[event.stage]} · {new Date(event.at).toLocaleTimeString()}</li>)}</ol></section> : null}
    {status?.history.length ? <section className="settings-card"><h2>Update history</h2><ul>{status.history.map(job => <li key={job.id}>Pulse {job.releaseId} — {updateStageLabels[job.stage]} · {new Date(job.createdAt).toLocaleString()}</li>)}</ul></section> : null}
  </div>;
}
