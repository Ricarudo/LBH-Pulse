export default function Loading() {
  return (
    <main className="route-loading-shell" aria-label="Loading Pulse page">
      <div className="route-loading-sidebar" />
      <section className="route-loading-content">
        <div className="route-loading-bar short" />
        <div className="route-loading-grid">
          <div />
          <div />
          <div />
        </div>
        <div className="route-loading-panel" />
      </section>
    </main>
  );
}
