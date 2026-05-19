export default function Loading() {
  return (
    <main className="route-loading-shell" aria-label="Loading Pulse page">
      <header className="route-loading-topbar">
        <div className="route-loading-brand" />
        <div className="route-loading-search" />
        <div className="route-loading-actions">
          <span />
          <span />
          <span />
        </div>
      </header>
      <div className="route-loading-body">
        <aside className="route-loading-sidebar">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index} />
          ))}
        </aside>
        <section className="route-loading-content">
          <div className="route-loading-page-header">
            <div className="route-loading-bar crumb" />
            <div className="route-loading-bar title" />
          </div>
          <div className="route-loading-grid">
            <div />
            <div />
            <div />
          </div>
          <div className="route-loading-panel" />
        </section>
      </div>
    </main>
  );
}
