import { PulseShell } from "@/components/PulseShell";
import { activity, quotes, requests } from "@/lib/starterData";

export default function StatisticsPage() {
  const approvedQuotes = quotes.filter(
    (quote) => quote.status === "Approved"
  ).length;
  const waitingApproval = quotes.filter(
    (quote) => quote.status === "Waiting Approval"
  ).length;

  return (
    <PulseShell
      activePage="statistics"
      title="Statistics"
      subtitle="High-level starter metrics for Pulse operations visibility."
    >
      <section className="metric-grid" aria-label="Statistics metrics">
        <article className="metric-card">
          <p className="metric-label">Request Pipeline</p>
          <p className="metric-value">{requests.length}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Quote Pipeline</p>
          <p className="metric-value">{quotes.length}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Approved Quotes</p>
          <p className="metric-value">{approvedQuotes}</p>
        </article>
      </section>

      <div className="split-grid">
        <section className="panel" aria-labelledby="pipeline-title">
          <div className="panel-header">
            <h2 id="pipeline-title">Pipeline Snapshot</h2>
          </div>
          <div className="list">
            <div className="list-item">
              <div>
                <strong>Requests ready for quote</strong>
                <span>Ready to become opportunities</span>
              </div>
              <span className="status-pill">
                {requests.filter((request) => request.status === "Ready for Quote").length}
              </span>
            </div>
            <div className="list-item">
              <div>
                <strong>Quotes waiting approval</strong>
                <span>Need manager review</span>
              </div>
              <span className="status-pill warning">{waitingApproval}</span>
            </div>
            <div className="list-item">
              <div>
                <strong>Approved handoffs</strong>
                <span>Ready for proposal/project flow</span>
              </div>
              <span className="status-pill">{approvedQuotes}</span>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="activity-title">
          <div className="panel-header">
            <h2 id="activity-title">Activity Feed</h2>
          </div>
          <div className="list">
            {activity.map((item) => (
              <div className="list-item" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PulseShell>
  );
}

