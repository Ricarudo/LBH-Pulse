import {
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  Grid2X2,
  ReceiptText,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import {
  businessObjects,
  commandRows,
  crossObjectActivity,
  kpis,
  lifecycle,
  priorities
} from "@/lib/starterData";

const objectIcons = [
  Building2,
  UsersRound,
  FileText,
  FolderKanban,
  ReceiptText
];

const lifecycleIcons = [
  UsersRound,
  FileText,
  CheckCircle2,
  BriefcaseBusiness,
  BadgeDollarSign
];

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 44 - (value / 34) * 34;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className={`sparkline sparkline-${tone}`} viewBox="0 0 100 48" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

export function HubDashboard() {
  return (
    <div className="hub-stack">
      <section className="kpi-grid" aria-label="Operations metrics">
        {kpis.map((kpi) => (
          <article className="kpi-card" key={kpi.label}>
            <div className={`kpi-icon tone-${kpi.tone}`}>
              <Grid2X2 size={24} />
            </div>
            <div className="kpi-copy">
              <p>{kpi.label}</p>
              <strong>{kpi.value}</strong>
              <span>{kpi.detail}</span>
            </div>
            <Sparkline values={kpi.trend} tone={kpi.tone} />
          </article>
        ))}
      </section>

      <section className="mock-panel business-panel" aria-labelledby="objects-title">
        <div className="section-heading">
          <div>
            <h2 id="objects-title">Business Objects</h2>
            <p>Each core object is managed independently but connected across the workflow.</p>
          </div>
          <button className="outline-action" type="button">
            <Grid2X2 size={16} />
            View all objects
          </button>
        </div>

        <div className="object-grid">
          {businessObjects.map((object, index) => {
            const Icon = objectIcons[index];

            return (
              <article className="object-card" key={object.label}>
                <div className={`object-icon tone-${object.tone}`}>
                  <Icon size={30} />
                </div>
                <div>
                  <h3>{object.label}</h3>
                  <p>{object.detail}</p>
                  <strong>{object.count}</strong>
                  <Link href={object.href}>
                    {object.action}
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mock-panel lifecycle-panel" aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title">Connected Lifecycle</h2>
        <div className="lifecycle-strip">
          {lifecycle.map((item, index) => {
            const Icon = lifecycleIcons[index];

            return (
              <div className="lifecycle-step" key={item}>
                <div className="lifecycle-pill">
                  <Icon size={18} />
                  <span>{item}</span>
                </div>
                {index < lifecycle.length - 1 ? <ArrowRight className="flow-arrow" size={18} /> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="hub-bottom-grid">
        <article className="mock-panel">
          <div className="compact-heading">
            <h2>Today's Priorities</h2>
          </div>
          <div className="priority-list">
            {priorities.map((priority) => (
              <div className="priority-row" key={priority.label}>
                <span className={`priority-dot tone-${priority.tone}`}>!</span>
                <p>{priority.label}</p>
                <strong>{priority.count}</strong>
                <ArrowRight size={15} />
              </div>
            ))}
          </div>
          <a className="panel-link" href="#">
            View all priorities
            <ArrowRight size={15} />
          </a>
        </article>

        <article className="mock-panel">
          <div className="compact-heading">
            <h2>Recent Cross-Object Activity</h2>
          </div>
          <div className="activity-list">
            {crossObjectActivity.map((item) => (
              <div className="activity-row" key={`${item.type}-${item.time}`}>
                <span className={`activity-tag tone-${item.tone}`}>{item.type}</span>
                <p>{item.text}</p>
                <time>{item.time}</time>
              </div>
            ))}
          </div>
          <a className="panel-link" href="#">
            View all activity
            <ArrowRight size={15} />
          </a>
        </article>

        <article className="command-panel">
          <div className="command-heading">
            <h2>Live Command View</h2>
            <span className="live-dot">Live</span>
          </div>
          <table className="command-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ID / Ref</th>
                <th>Description</th>
                <th>Status</th>
                <th>Owner</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {commandRows.map((row) => (
                <tr key={row.ref}>
                  <td>{row.type}</td>
                  <td>{row.ref}</td>
                  <td>{row.description}</td>
                  <td>
                    <span>{row.status}</span>
                  </td>
                  <td>{row.owner}</td>
                  <td>{row.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a className="command-link" href="#">
            View full command center
            <ArrowRight size={15} />
            <ExternalLink size={18} />
          </a>
        </article>
      </section>
    </div>
  );
}
