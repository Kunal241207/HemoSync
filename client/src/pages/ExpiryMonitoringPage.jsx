import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, RefreshCw, CheckCircle2, X, Shield, Layers, ArrowLeftRight, Check, AlertCircle } from 'lucide-react';
import { apiClient, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function ExpiryMonitoringPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState('alerts'); // 'alerts' | 'redistribution' | 'breakdown'
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsNotice, setSuggestionsNotice] = useState('');

  // Filters
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [severityFilter, setSeverityFilter] = useState('');

  // Loading & Error States
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modal State for Alert Resolution
  const [resolvingAlert, setResolvingAlert] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingResolution, setSubmittingResolution] = useState(false);

  // Load summary KPIs
  const fetchSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const res = await apiClient.getExpirySummary();
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load expiry summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // Load alerts
  const fetchAlerts = useCallback(async (page = 1) => {
    try {
      setLoadingAlerts(true);
      setActionError(null);
      const params = {
        page,
        limit: 20,
        resolved: resolvedFilter
      };
      if (severityFilter) params.severity = severityFilter;

      const res = await apiClient.getExpiryAlerts(params);
      setAlerts(res.data.alerts || []);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      setActionError(err.message || 'Failed to load expiry alerts');
    } finally {
      setLoadingAlerts(false);
    }
  }, [resolvedFilter, severityFilter]);

  // Load redistribution suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      setActionError(null);
      const res = await apiClient.getRedistributionSuggestions({ maxDistanceKm: 150 });
      setSuggestions(res.data.suggestions || []);
      setSuggestionsNotice(res.data.regulatoryNotice || '');
    } catch (err) {
      setActionError(err.message || 'Failed to load redistribution suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchAlerts(1);
  }, [fetchSummary, fetchAlerts]);

  // Tab switch effect
  useEffect(() => {
    if (activeTab === 'redistribution' && suggestions.length === 0) {
      fetchSuggestions();
    }
  }, [activeTab, fetchSuggestions, suggestions.length]);

  // Trigger manual sweep
  const handleRunSweep = async () => {
    try {
      setIsSweeping(true);
      setActionError(null);
      setActionSuccess(null);
      const res = await apiClient.runExpiryJob({});
      const { expiredUnitsMarked, alertsCreated, alertsUpdated } = res.data;
      setActionSuccess(
        `Expiry sweep completed: ${expiredUnitsMarked} units marked expired, ${alertsCreated} new alerts created, ${alertsUpdated} alerts escalated.`
      );
      await Promise.all([fetchSummary(), fetchAlerts(1)]);
      if (activeTab === 'redistribution') {
        await fetchSuggestions();
      }
    } catch (err) {
      setActionError(err.message || 'Failed to execute expiry sweep');
    } finally {
      setIsSweeping(false);
    }
  };

  // Open resolve modal
  const openResolveModal = (alert) => {
    setResolvingAlert(alert);
    setResolutionNotes('');
  };

  // Submit resolve
  const handleResolveAlert = async (e) => {
    e.preventDefault();
    if (!resolvingAlert) return;

    try {
      setSubmittingResolution(true);
      await apiClient.resolveExpiryAlert(resolvingAlert.id, { notes: resolutionNotes });
      setActionSuccess(`Alert for unit ${resolvingAlert.bloodUnit?.unitCode} resolved successfully.`);
      setResolvingAlert(null);
      await Promise.all([fetchSummary(), fetchAlerts(pagination.page)]);
    } catch (err) {
      setActionError(err.message || 'Failed to resolve alert');
    } finally {
      setSubmittingResolution(false);
    }
  };

  return (
    <div className="page-container ops-page">
      {/* Header */}
      <div className="page-header ops-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Clock size={22} style={{ color: 'var(--brand-forest)' }} />
            Expiry Monitoring & Redistribution
          </h1>
          <p className="page-subtitle">
            Component-specific shelf life tracking, automated expiry deprecation, and constrained redistribution decision support.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleRunSweep}
            disabled={isSweeping}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={14} className={isSweeping ? 'spin' : ''} />
            {isSweeping ? 'Running Sweep...' : 'Run Expiry Sweep'}
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="card" style={{ backgroundColor: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)', color: 'var(--status-success-text)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}><Check size={16} /> {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}
      {actionError && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}><AlertTriangle size={16} /> {actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Units Expired</div>
          <div className="stat-value" style={{ color: 'var(--color-danger, #dc2626)' }}>
            {loadingSummary ? '...' : summary?.kpis?.totalExpiredUnits || 0}
          </div>
          <div className="stat-desc">Marked ineligible for allocation</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Expiring Soon</div>
          <div className="stat-value" style={{ color: '#d97706' }}>
            {loadingSummary ? '...' : summary?.kpis?.totalNearExpiryUnits || 0}
          </div>
          <div className="stat-desc">Approaching threshold</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Critical Alerts</div>
          <div className="stat-value" style={{ color: 'var(--color-danger, #dc2626)' }}>
            {loadingSummary ? '...' : summary?.kpis?.criticalAlertsCount || 0}
          </div>
          <div className="stat-desc">Immediate action needed</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Redistribution Candidates</div>
          <div className="stat-value" style={{ color: 'var(--color-primary, #0284c7)' }}>
            {loadingSummary ? '...' : summary?.kpis?.redistributionCandidatesCount || 0}
          </div>
          <div className="stat-desc">Transit window eligible</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs" style={{ display: 'flex', borderBottom: '2px solid var(--color-border, #e2e8f0)', marginBottom: '1.5rem', gap: '0.5rem' }}>
        <button
          className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'alerts' ? '3px solid var(--brand-forest)' : '3px solid transparent',
            fontWeight: activeTab === 'alerts' ? 600 : 500,
            cursor: 'pointer',
            color: activeTab === 'alerts' ? 'var(--brand-forest)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <AlertTriangle size={15} /> Expiry Alerts ({pagination.total})
        </button>
        <button
          className={`tab-btn ${activeTab === 'redistribution' ? 'active' : ''}`}
          onClick={() => setActiveTab('redistribution')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'redistribution' ? '3px solid var(--brand-forest)' : '3px solid transparent',
            fontWeight: activeTab === 'redistribution' ? 600 : 500,
            cursor: 'pointer',
            color: activeTab === 'redistribution' ? 'var(--brand-forest)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <ArrowLeftRight size={15} /> Redistribution Suggestions
        </button>
        <button
          className={`tab-btn ${activeTab === 'breakdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('breakdown')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'breakdown' ? '3px solid var(--brand-forest)' : '3px solid transparent',
            fontWeight: activeTab === 'breakdown' ? 600 : 500,
            cursor: 'pointer',
            color: activeTab === 'breakdown' ? 'var(--brand-forest)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <Layers size={15} /> Risk Breakdown & Timeline
        </button>
      </div>

      {/* TAB 1: ALERTS */}
      {activeTab === 'alerts' && (
        <div className="card">
          {/* Filter Bar */}
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Expiry Alerts Log</h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <select
                value={resolvedFilter}
                onChange={(e) => setResolvedFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto' }}
              >
                <option value="false">Active Only (Unresolved)</option>
                <option value="true">Resolved Only</option>
                <option value="all">All Alerts</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto' }}
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>

              <button onClick={() => fetchAlerts(1)} className="btn btn-secondary btn-sm" title="Refresh alerts" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <RefreshCw size={13} className={loadingAlerts ? 'spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Alerts Table */}
          {loadingAlerts ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <RefreshCw size={16} className="spin" /> Loading expiry alerts...
              </div>
            </div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem auto', color: 'var(--status-success-text)' }} />
              <p style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>No active expiry alerts.</p>
              <p style={{ fontSize: '0.85rem' }}>All monitored units are within healthy shelf-life tolerances.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Unit Code</th>
                    <th>Component & ABO/Rh</th>
                    <th>Expiry Date (UTC)</th>
                    <th>Time Remaining</th>
                    <th>Unit Status</th>
                    <th>Institution</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => {
                    const unit = alert.bloodUnit;
                    const risk = alert.currentRisk;
                    const isResolved = alert.resolved;

                    return (
                      <tr key={alert.id} style={{ backgroundColor: isResolved ? '#f8fafc' : 'transparent' }}>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor:
                                alert.severity === 'CRITICAL'
                                  ? '#fee2e2'
                                  : alert.severity === 'HIGH'
                                  ? '#ffedd5'
                                  : '#fef3c7',
                              color:
                                alert.severity === 'CRITICAL'
                                  ? '#991b1b'
                                  : alert.severity === 'HIGH'
                                  ? '#9a3412'
                                  : '#92400e',
                              fontWeight: '600',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px'
                            }}
                          >
                            {alert.severity}
                          </span>
                        </td>
                        <td style={{ fontWeight: '600' }}>
                          <code>{unit?.unitCode || 'N/A'}</code>
                        </td>
                        <td>
                          <div>
                            <strong>{unit?.componentType?.replace(/_/g, ' ')}</strong>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            {unit?.aboGroup}{unit?.rhFactor === 'POSITIVE' ? '+' : '-'} • {unit?.volumeMl} mL
                          </div>
                        </td>
                        <td>
                          {unit?.expiryDate ? new Date(unit.expiryDate).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          {risk ? (
                            risk.isExpired ? (
                              <span style={{ color: '#dc2626', fontWeight: '600' }}>EXPIRED</span>
                            ) : (
                              <span>
                                <strong>{risk.hoursUntilExpiry}h</strong> ({risk.daysUntilExpiry}d)
                              </span>
                            )
                          ) : (
                            '--'
                          )}
                        </td>
                        <td>
                          <StatusBadge status={unit?.inventoryStatus} />
                        </td>
                        <td>
                          <span style={{ fontSize: '0.875rem' }}>{alert.institution?.name}</span>
                        </td>
                        <td>
                          {isResolved ? (
                            <span style={{ color: 'var(--status-success-text)', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Check size={14} /> Resolved
                            </span>
                          ) : (
                            <span style={{ color: 'var(--status-danger-text)', fontSize: '0.85rem', fontWeight: 600 }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td>
                          {!isResolved && (
                            <button
                              onClick={() => openResolveModal(alert)}
                              className="btn btn-sm btn-outline"
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total alerts)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchAlerts(pagination.page - 1)}
                  className="btn btn-sm btn-outline"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchAlerts(pagination.page + 1)}
                  className="btn btn-sm btn-outline"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REDISTRIBUTION SUGGESTIONS */}
      {activeTab === 'redistribution' && (
        <div>
          {/* Regulatory Safety Banner */}
          <div
            className="card"
            style={{
              marginBottom: '1.25rem',
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.85rem 1.1rem'
            }}
          >
            <Shield size={18} style={{ color: 'var(--brand-forest)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
              <strong>Clinical Decision Support:</strong> {suggestionsNotice || 'All redistribution suggestions are decision-support recommendations. Every inter-institution transfer requires clinical verification and human authorization through the authorized Transfer workflow.'}
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Redistribution Candidates</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Near-expiry units verified with sufficient shelf life for transit and matched against nearby hospital demand.
                </p>
              </div>
              <button onClick={fetchSuggestions} disabled={loadingSuggestions} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <RefreshCw size={13} className={loadingSuggestions ? 'spin' : ''} />
                {loadingSuggestions ? 'Refreshing...' : 'Refresh Suggestions'}
              </button>
            </div>

            {loadingSuggestions ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <RefreshCw size={16} className="spin" /> Calculating optimal redistribution routes...
                </div>
              </div>
            ) : suggestions.length === 0 ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem auto', color: 'var(--status-success-text)' }} />
                <p style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>No redistribution candidates found</p>
                <p style={{ fontSize: '0.85rem' }}>
                  Either inventory is at safe shelf life levels, or no near-expiry units meet minimum handling transit buffers.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Candidate Unit</th>
                      <th>Component & Group</th>
                      <th>Shelf Life Remaining</th>
                      <th>Recommended Target</th>
                      <th>Distance</th>
                      <th>Matching Rationale</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((sug) => (
                      <tr key={sug.id}>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: sug.priority === 'HIGH' ? '#fee2e2' : '#fef3c7',
                              color: sug.priority === 'HIGH' ? '#991b1b' : '#92400e',
                              fontWeight: '600',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px'
                            }}
                          >
                            {sug.priority}
                          </span>
                        </td>
                        <td>
                          <code>{sug.unit?.unitCode}</code>
                        </td>
                        <td>
                          <strong>{sug.unit?.componentType?.replace(/_/g, ' ')}</strong>
                          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            {sug.unit?.aboGroup}{sug.unit?.rhFactor === 'POSITIVE' ? '+' : '-'} • {sug.unit?.volumeMl} mL
                          </div>
                        </td>
                        <td>
                          <span style={{ color: '#d97706', fontWeight: '600' }}>
                            {sug.unit?.hoursUntilExpiry}h left
                          </span>
                        </td>
                        <td>
                          <strong>{sug.targetInstitution?.name}</strong>
                          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            {sug.targetInstitution?.type}
                          </div>
                        </td>
                        <td>
                          <strong>{sug.distanceKm} km</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Haversine</div>
                        </td>
                        <td style={{ maxWidth: '280px', fontSize: '0.875rem' }}>
                          <div style={{ fontWeight: '500' }}>{sug.priorityReason}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                            {sug.actionRequired}
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => navigate('/transfers')}
                            className="btn btn-sm btn-primary"
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            Coordinate Transfer →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COMPONENT BREAKDOWN & TIMELINE */}
      {activeTab === 'breakdown' && summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Component Risk Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {Object.entries(summary.componentBreakdown || {}).map(([compName, data]) => (
              <div key={compName} className="card" style={{ padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--color-primary)' }}>
                  {compName.replace(/_/g, ' ')}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Critical Risk (Imminent):</span>
                    <strong style={{ color: '#dc2626' }}>{data.critical}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>High Risk:</span>
                    <strong style={{ color: '#ea580c' }}>{data.high}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Medium Risk:</span>
                    <strong style={{ color: '#ca8a04' }}>{data.medium}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                    <span>Total Near Expiry:</span>
                    <strong>{data.totalNearExpiry}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Redistribution Eligible:</span>
                    <strong style={{ color: '#0284c7' }}>{data.redistributionEligible}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Urgent Action Timeline */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} style={{ color: 'var(--status-danger-text)' }} />
                Immediate Expiry Action List (Next 10 Units)
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Units with the shortest remaining shelf life requiring immediate clinical prioritization or transfer.
              </p>
            </div>
            {summary.urgentActionList?.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                No urgent units requiring immediate action.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Unit Code</th>
                      <th>Component</th>
                      <th>Blood Group</th>
                      <th>Hours Left</th>
                      <th>Severity</th>
                      <th>Can Redistribute?</th>
                      <th>Facility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.urgentActionList.map((unit) => (
                      <tr key={unit.id}>
                        <td><code>{unit.unitCode}</code></td>
                        <td>{unit.componentType?.replace(/_/g, ' ')}</td>
                        <td><strong>{unit.aboGroup}{unit.rhFactor === 'POSITIVE' ? '+' : '-'}</strong></td>
                        <td>
                          <span style={{ color: '#dc2626', fontWeight: '700' }}>
                            {unit.hoursUntilExpiry}h ({unit.daysUntilExpiry}d)
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: unit.severity === 'CRITICAL' ? '#fee2e2' : '#ffedd5',
                              color: unit.severity === 'CRITICAL' ? '#991b1b' : '#9a3412',
                              fontWeight: '600'
                            }}
                          >
                            {unit.severity}
                          </span>
                        </td>
                        <td>
                          {unit.canRedistribute ? (
                            <span style={{ color: 'var(--status-success-text)', fontWeight: 600, fontSize: '0.825rem' }}>Eligible</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>Window Expired</span>
                          )}
                        </td>
                        <td>{unit.institution?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {resolvingAlert && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <h3 style={{ marginTop: 0 }}>Resolve Expiry Alert</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              Unit: <code>{resolvingAlert.bloodUnit?.unitCode}</code> ({resolvingAlert.bloodUnit?.componentType?.replace(/_/g, ' ')})
            </p>

            <form onSubmit={handleResolveAlert}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Resolution Notes / Clinical Action Taken:
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  required
                  placeholder="e.g. Unit allocated to trauma patient / Scheduled for disposal / Transferred to partner hospital"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setResolvingAlert(null)}
                  disabled={submittingResolution}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution || !resolutionNotes.trim()}
                  className="btn btn-primary"
                >
                  {submittingResolution ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpiryMonitoringPage;
