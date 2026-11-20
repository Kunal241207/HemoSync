import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/api';
import {
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Droplet,
  CalendarDays,
  ClipboardList,
  ArrowLeftRight,
  BarChart3
} from 'lucide-react';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [inventoryStats, setInventoryStats] = useState({ totalAvailable: 0, byType: {} });
  const [alerts, setAlerts] = useState([]);
  const [openRequests, setOpenRequests] = useState([]);
  const [activeTransfers, setActiveTransfers] = useState([]);
  const [expiryAlertTotal, setExpiryAlertTotal] = useState(0);
  const [forecast, setForecast] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [allocatingId, setAllocatingId] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type, id: Date.now() });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadDashboardData = useCallback(async () => {
    try {
      const [invRes, pendingReqRes, partialReqRes, alertRes, requestedTransRes, approvedTransRes, dispatchedTransRes, foreRes] = await Promise.all([
        apiClient.getInventorySummary().catch(() => ({ data: null })),
        apiClient.getRequests({ status: 'PENDING', limit: 8 }).catch(() => ({ data: { requests: [] } })),
        apiClient.getRequests({ status: 'PARTIALLY_ALLOCATED', limit: 8 }).catch(() => ({ data: { requests: [] } })),
        apiClient.getExpiryAlerts({ resolved: 'false', limit: 5 }).catch(() => ({ data: { alerts: [] } })),
        apiClient.getTransfers({ status: 'REQUESTED', limit: 5 }).catch(() => ({ data: { transfers: [] } })),
        apiClient.getTransfers({ status: 'APPROVED', limit: 5 }).catch(() => ({ data: { transfers: [] } })),
        apiClient.getTransfers({ status: 'DISPATCHED', limit: 5 }).catch(() => ({ data: { transfers: [] } })),
        apiClient.getSimpleForecast().catch(() => ({ data: null }))
      ]);

      // Process inventory stats
      const invData = invRes?.data;
      let totalAvailable = 0;
      const typeMap = {};
      BLOOD_TYPES.forEach((t) => { typeMap[t] = 0; });

      if (invData?.distribution) {
        invData.distribution.forEach((item) => {
          const typeKey = `${item.aboGroup}${item.rhFactor === 'POSITIVE' ? '+' : '-'}`;
          typeMap[typeKey] = (typeMap[typeKey] || 0) + (item.count || item._count?.id || 0);
        });
        totalAvailable = invData.totalUnits || Object.values(typeMap).reduce((a, b) => a + b, 0);
      } else {
        // Fallback: calculate from raw units
        const unitsRes = await apiClient.getInventory({ limit: 100, inventoryStatus: 'AVAILABLE' }).catch(() => ({ data: { units: [] } }));
        const units = unitsRes?.data?.units || [];
        totalAvailable = units.length;
        units.forEach((u) => {
          const typeKey = `${u.aboGroup}${u.rhFactor === 'POSITIVE' ? '+' : '-'}`;
          typeMap[typeKey] = (typeMap[typeKey] || 0) + 1;
        });
      }

      const openRequestMap = new Map();
      [...(pendingReqRes?.data?.requests || []), ...(partialReqRes?.data?.requests || [])].forEach((request) => {
        openRequestMap.set(request.id, request);
      });
      const openRequests = [...openRequestMap.values()].slice(0, 8);

      const activeTransferMap = new Map();
      [
        ...(requestedTransRes?.data?.transfers || []),
        ...(approvedTransRes?.data?.transfers || []),
        ...(dispatchedTransRes?.data?.transfers || [])
      ].forEach((transfer) => {
        activeTransferMap.set(transfer.id, transfer);
      });

      setInventoryStats({ totalAvailable, byType: typeMap });
      setOpenRequests(openRequests);
      setAlerts(alertRes?.data?.alerts || []);
      setExpiryAlertTotal(alertRes?.data?.pagination?.total ?? (alertRes?.data?.alerts || []).length);
      setActiveTransfers([...activeTransferMap.values()].slice(0, 5));
      setForecast(foreRes?.data?.forecast || null);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();

    // Listen for live WebSocket updates
    const handleWsEvent = () => {
      loadDashboardData();
    };

    window.addEventListener('hemosync:live-update', handleWsEvent);
    return () => window.removeEventListener('hemosync:live-update', handleWsEvent);
  }, [loadDashboardData]);

  // FIFO Allocation handler
  const handleAllocate = async (request) => {
    try {
      setAllocatingId(request.id);
      const remainingNeed = request.requestedQuantity - (request.fulfilledQuantity || 0);
      const res = await apiClient.allocateUnits(request.id, {
        quantity: remainingNeed > 0 ? remainingNeed : 1
      });

      const allocatedCount = res?.data?.allocatedCount || 1;
      const newStatus = res?.data?.newStatus || 'ALLOCATED';
      showToast(`Allocated ${allocatedCount} unit(s) using FIFO-by-expiry. Status: ${newStatus}`);
      await loadDashboardData();
    } catch (err) {
      showToast(err.message || 'Failed to allocate units', 'error');
    } finally {
      setAllocatingId(null);
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: 640, margin: '4rem auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🩸</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '0.75rem' }}>
            HemoSync Network
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Multi-bank blood inventory, urgent hospital request routing, and FIFO allocation platform.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: '14px' }}>
            Sign in to Operations Center →
          </Link>
        </div>
      </div>
    );
  }

  const expiringCount = expiryAlertTotal;
  const emergencyCount = openRequests.filter((r) => r.urgency === 'EMERGENCY').length;

  return (
    <div>
      {/* Hero Strip */}
      <div className="hero-strip">
        <div>
          <p className="snapshot-label"><BarChart3 size={17} /> Network Snapshot</p>
          <h2>Keep every viable <strong>blood unit</strong> moving.</h2>
          <p className="hero-copy">
            HemoSync coordinates supply across connected regional blood banks<br /> and hospitals to ensure timely access.
          </p>
        </div>
        <div className="hero-drop" aria-hidden="true">
          <svg viewBox="0 0 100 132" role="presentation">
            <defs>
              <linearGradient id="heroBloodDrop" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#ff7894" />
                <stop offset=".42" stopColor="#d51d4c" />
                <stop offset="1" stopColor="#82102f" />
              </linearGradient>
              <linearGradient id="dropShine" x1="0" y1="0" x2="1" y2="0">
                <stop stopColor="#fff" stopOpacity=".75" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M50 4C40 23 13 56 13 86a37 37 0 0 0 74 0C87 56 60 23 50 4Z" fill="url(#heroBloodDrop)" />
            <path d="M43 24C31 46 22 63 22 81c0 9 3 16 9 21" fill="none" stroke="url(#dropShine)" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Metric Grid */}
      <div className="metric-grid">
        <div className="metric-card">
          <span className="metric-icon"><Droplet /></span>
          <div className="metric-content"><strong>{inventoryStats.totalAvailable}</strong><span>Units Available</span></div>
          <span className="metric-trend positive">↗ +12%</span>
        </div>

        <div className={`metric-card ${expiringCount > 0 ? 'alert' : ''}`}>
          <span className="metric-icon"><CalendarDays /></span>
          <div className="metric-content"><strong>{expiringCount}</strong><span>Expiring in 7 Days</span></div>
          <span className="metric-sparkline orange" />
        </div>

        <div className="metric-card">
          <span className="metric-icon"><ClipboardList /></span>
          <div className="metric-content"><strong>{openRequests.length}</strong><span>Pending Requests</span></div>
          <span className="metric-sparkline pink" />
        </div>

        <div className="metric-card">
          <span className="metric-icon"><ArrowLeftRight /></span>
          <div className="metric-content"><strong>{activeTransfers.length}</strong><span>Active Transfers</span></div>
          <span className="metric-sparkline green" />
        </div>
      </div>

      {/* Inventory Summary by Blood Type */}
      <div className="section-heading">
        <div>
          <h2><i />Inventory Overview</h2>
        </div>
        <button
          className="text-button"
          onClick={() => navigate('/inventory')}
        >
          View Full Inventory <ArrowRight size={18} />
        </button>
      </div>

      <div className="inventory-grid">
        {BLOOD_TYPES.map((type) => {
          const count = inventoryStats.byType[type] || 0;
          const level = count < 20 ? 'watch' : 'healthy';
          const levelLabel = count < 20 ? 'Low Stock' : 'Healthy';
          const percentage = Math.min(100, Math.max(12, count / Math.max(1, ...Object.values(inventoryStats.byType)) * 100));

          return (
            <div
              key={type}
              className={`inventory-card stock-${level}`}
              onClick={() => navigate(`/inventory?aboGroup=${type.replace(/[+-]/, '')}&rhFactor=${type.includes('+') ? 'POSITIVE' : 'NEGATIVE'}`)}
            >
              <div className="inventory-card-copy">
                <span className="blood-type">{type}</span>
                <strong>{count}<small> Units</small></strong>
                <span className={`level ${level}`}><span /> {levelLabel}</span>
              </div>
              <Droplet className="inventory-drop" />
              <span className="inventory-meter"><i style={{ width: `${percentage}%` }} /></span>
            </div>
          );
        })}
      </div>

      {/* Split Panels: Expiring Soon + Demand Forecast */}
      <div className="lower-grid">
        {/* Expiring Soon Panel */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Requires attention</p>
              <h2>Near-expiry alerts</h2>
            </div>
            <span className="forecast-badge">{expiringCount} unit{expiringCount !== 1 ? 's' : ''}</span>
          </div>

          {alerts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px'
                  }}
                >
                  <div>
                    <span className="blood-type tiny" style={{ marginRight: '8px' }}>
                      {alert.bloodUnit?.aboGroup}{alert.bloodUnit?.rhFactor === 'POSITIVE' ? '+' : '-'}
                    </span>
                    <strong>Unit {alert.bloodUnit?.unitCode || alert.bloodUnitId.slice(0, 8)}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                      {alert.institution?.name} • Expires {new Date(alert.bloodUnit?.expiryDate).toLocaleDateString()}
                    </div>
                  </div>
                  <Link to="/expiry" className="btn btn-secondary btn-sm">
                    Review
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '2rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <CheckCircle2 size={15} color="#2d6a4f" />
              <span>All inventory units clear of near-term expiry.</span>
            </div>
          )}
        </section>

        {/* 14-Day Demand Forecast Panel */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sample Projection</p>
              <h2>14-day demand forecast</h2>
            </div>
            <span className="forecast-badge">Next 14 days</span>
          </div>

          <div className="forecast-table">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Daily Avg</th>
                  <th>14-Day Need</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(forecast || []).map((f) => (
                  <tr key={f.bloodType}>
                    <td><span className="blood-type tiny">{f.bloodType}</span></td>
                    <td>{f.avgDailyDemand}</td>
                    <td>{f.projected14DayDemand}</td>
                    <td>{f.currentStock}</td>
                    <td>
                      <span className={`forecast-status forecast-${f.riskLevel}`}>
                        {f.riskLevel === 'critical' ? 'Shortage' : f.riskLevel === 'watch' ? 'Tight' : 'Adequate'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!forecast && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading demand forecast projections...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Pending Blood Requests Section */}
      <div style={{ marginTop: '2rem' }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Action queue</p>
            <h2>Pending hospital blood requests</h2>
          </div>
          <Link to="/requests" className="text-button">
            All requests ({openRequests.length}) <span>→</span>
          </Link>
        </div>

        <div className="table-wrap">
          <table className="requests-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Hospital</th>
                <th>Quantity</th>
                <th>Fulfilled</th>
                <th>Urgency</th>
                <th>Required By</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {openRequests.length > 0 ? (
                openRequests.map((req) => {
                  const typeLabel = `${req.requestedABO}${req.requestedRh === 'POSITIVE' ? '+' : '-'}`;
                  const isAllocating = allocatingId === req.id;
                  const urgencyClass = req.urgency === 'EMERGENCY'
                    ? 'badge-emergency'
                    : req.urgency === 'URGENT'
                    ? 'badge-urgent'
                    : 'badge-routine';

                  return (
                    <tr key={req.id}>
                      <td>
                        <span className="blood-type tiny">{typeLabel}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                          {req.requestedComponent === 'RED_BLOOD_CELLS' ? 'RBC' : req.requestedComponent}
                        </span>
                      </td>
                      <td>
                        <strong>{req.hospital?.name || 'Hospital'}</strong>
                      </td>
                      <td>{req.requestedQuantity}</td>
                      <td>{req.fulfilledQuantity || 0}</td>
                      <td>
                        <span className={`badge ${urgencyClass}`}>
                          {req.urgency}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {new Date(req.requiredBy).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '10px' }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            className="allocate-btn"
                            disabled={isAllocating}
                            onClick={() => handleAllocate(req)}
                          >
                            {isAllocating ? 'Allocating...' : 'FIFO Allocate'}
                          </button>
                          <Link
                            to={`/requests?view=${req.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No pending blood requests in queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-container">
          <div className={`toast ${toastMessage.type === 'error' ? 'error' : ''}`}>
            {toastMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
