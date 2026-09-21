import { useEffect, useState } from 'react';

const inventory = [
  { type: 'O-', units: 18, trend: '+4 today', level: 'critical' },
  { type: 'O+', units: 124, trend: '+12 today', level: 'healthy' },
  { type: 'A+', units: 86, trend: '-8 today', level: 'watch' },
  { type: 'B+', units: 61, trend: '+3 today', level: 'healthy' }
];

export function App() {
  const [currentInventory, setCurrentInventory] = useState(inventory);
  const [expiryAlerts, setExpiryAlerts] = useState([]);

  useEffect(() => {
    let active = true;

    async function refreshDashboard() {
      try {
        const [unitsResponse, alertsResponse] = await Promise.all([
          fetch('/api/units'),
          fetch('/api/alerts/expiry')
        ]);

        if (!unitsResponse.ok || !alertsResponse.ok) {
          return;
        }

        const unitsPayload = await unitsResponse.json();
        const alertsPayload = await alertsResponse.json();
        const units = Array.isArray(unitsPayload) ? unitsPayload : unitsPayload.units;
        const alerts = Array.isArray(alertsPayload) ? alertsPayload : alertsPayload.alerts;

        if (active && Array.isArray(units) && units.length > 0) {
          setCurrentInventory(units);
        }

        if (active && Array.isArray(alerts)) {
          setExpiryAlerts(alerts);
        }
      } catch {
        // Keep the current dashboard values until the next refresh succeeds.
      }
    }

    refreshDashboard();
    const interval = setInterval(refreshDashboard, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>H</span><strong>HemoSync</strong></div>
        <p className="eyebrow">Operations center</p>
        <nav className="nav-list" aria-label="Primary navigation">
          <a className="nav-item active" href="#overview">Overview <span>01</span></a>
          <a className="nav-item" href="#inventory">Inventory <span>02</span></a>
          <a className="nav-item" href="#requests">Requests <span>03</span></a>
          <a className="nav-item" href="#banks">Bank network <span>04</span></a>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> All systems operational
          <small>Last synced 2 min ago</small>
        </div>
      </aside>

      <section className="content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">Monday, September 21, 2026</p>
            <h1>Good morning, operator.</h1>
          </div>
          <button className="operator-button" type="button"><span className="avatar">MC</span> Maya Chen <span className="chevron">⌄</span></button>
        </header>

        <div className="hero-strip">
          <div>
            <p className="eyebrow">Network snapshot</p>
            <h2>Keep every viable unit moving.</h2>
            <p className="hero-copy">HemoSync balances supply across 12 connected banks and routes hospital requests to the closest available stock.</p>
          </div>
          <div className="hero-stat"><strong>14,280</strong><span>units tracked</span></div>
          <div className="hero-stat"><strong>98.6%</strong><span>fulfillment rate</span></div>
        </div>

        <div className="metric-grid">
          <article className="metric-card"><span className="metric-label">Available now</span><strong>1,842</strong><span className="positive">↑ 8.4% <em>vs last week</em></span></article>
          <article className="metric-card alert"><span className="metric-label">Expiring in 7 days</span><strong>76</strong><span className="warning">Needs redistribution</span></article>
          <article className="metric-card"><span className="metric-label">Open requests</span><strong>23</strong><span className="neutral">9 high priority</span></article>
          <article className="metric-card"><span className="metric-label">Units saved this month</span><strong>214</strong><span className="positive">↑ 31.2% <em>vs last month</em></span></article>
        </div>

        <div className="section-heading"><div><p className="eyebrow">Stock health</p><h2>Inventory by blood type</h2></div><button className="text-button" type="button">View inventory <span>→</span></button></div>
        <div className="inventory-grid" id="inventory">
          {currentInventory.map((item) => <article className="inventory-card" key={item.type}><div className="blood-type">{item.type}</div><div><strong>{item.units}</strong><span>units available</span></div><div className={`level ${item.level}`}><span /> {item.level === 'critical' ? 'Critical level' : item.level === 'watch' ? 'Watch closely' : 'Healthy stock'}</div><small>{item.trend}</small></article>)}
        </div>

        <div className="lower-grid">
          <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Expiring soon</h2></div><button className="icon-button" type="button" aria-label="More expiry options">•••</button></div><div className="expiry-row"><span className="blood-type small">O-</span><div><strong>St. Mary's General</strong><small>Bank 04 · 12 units</small></div><span className="days">2 days</span></div><div className="expiry-row"><span className="blood-type small">A+</span><div><strong>Central City Blood Bank</strong><small>Bank 01 · 28 units</small></div><span className="days">5 days</span></div><div className="expiry-row"><span className="blood-type small">B-</span><div><strong>Northside Medical</strong><small>Bank 09 · 7 units</small></div><span className="days">6 days</span></div></section>
          <section className="panel forecast-panel"><div className="panel-heading"><div><p className="eyebrow">Sample data</p><h2>Demand forecast</h2></div><span className="forecast-badge">Next 14 days</span></div><div className="chart"><div className="chart-line" /><div className="chart-labels"><span>Sep 21</span><span>Sep 28</span><span>Oct 5</span></div></div><div className="forecast-note"><span className="spark">↗</span><span>O- demand may exceed current supply by <strong>18 units</strong>.</span></div></section>
        </div>
      </section>
    </main>
  );
}
