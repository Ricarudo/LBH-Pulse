"use client";

import { useEffect, useState } from "react";
import { BarChart3, Clock3, Database, ShieldCheck } from "lucide-react";
import type { DataPracticesRecord } from "@pulse/contracts/audit";

const fallbackPractices: DataPracticesRecord = {
  auditRetentionDays: 365,
  operationalRetentionDays: 730
};

export function SettingsPrivacySection() {
  const [practices, setPractices] = useState(fallbackPractices);
  const [status, setStatus] = useState("Loading the workspace retention policy…");

  useEffect(() => {
    async function loadPractices() {
      try {
        const response = await fetch("/api/settings/data-practices", { cache: "no-store" });
        const data = await response.json() as Partial<DataPracticesRecord> & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load the retention policy.");
        setPractices({
          auditRetentionDays: data.auditRetentionDays ?? fallbackPractices.auditRetentionDays,
          operationalRetentionDays:
            data.operationalRetentionDays ?? fallbackPractices.operationalRetentionDays
        });
        setStatus("Workspace recording and retention policy loaded.");
      } catch {
        setStatus("Showing the standard retention policy. Ask an Administrator if workspace settings differ.");
      }
    }

    void loadPractices();
  }, []);

  return (
    <div className="settings-content-stack">
      <section className="settings-card" aria-labelledby="pulse-recording-title">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><Database size={20} /></div>
          <div>
            <h2 id="pulse-recording-title">What Pulse records and why</h2>
            <p>Pulse keeps a limited history so teams can understand work, secure accounts, and improve processes.</p>
          </div>
        </div>
        <div className="privacy-practice-grid">
          <article>
            <Database size={18} aria-hidden="true" />
            <div>
              <h3>Work history</h3>
              <p>Status changes, assignments, comments, documents, and decisions stay with the relevant record and scoped dashboard.</p>
            </div>
          </article>
          <article>
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <h3>Security audit</h3>
              <p>Sign-ins, account changes, permissions, and workspace administration are visible only to protected Administrators.</p>
            </div>
          </article>
          <article>
            <BarChart3 size={18} aria-hidden="true" />
            <div>
              <h3>Analytics</h3>
              <p>Operational events may be aggregated to improve workflows. Pulse does not present a global employee-activity feed.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="retention-title">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><Clock3 size={20} /></div>
          <div>
            <h2 id="retention-title">Retention and access</h2>
            <p>Records are removed automatically after their documented retention period.</p>
          </div>
        </div>
        <dl className="settings-definition-grid">
          <div>
            <dt>Operational history</dt>
            <dd>{practices.operationalRetentionDays} days</dd>
          </div>
          <div>
            <dt>Security audit</dt>
            <dd>{practices.auditRetentionDays} days</dd>
          </div>
          <div>
            <dt>Everyday access</dt>
            <dd>Only records and dashboard scope you can already view</dd>
          </div>
          <div>
            <dt>Audit access</dt>
            <dd>Protected Administrators only; audit-log views are recorded</dd>
          </div>
        </dl>
        <p className="settings-inline-message privacy-policy-status" role="status" aria-live="polite">
          {status}
        </p>
      </section>
    </div>
  );
}
