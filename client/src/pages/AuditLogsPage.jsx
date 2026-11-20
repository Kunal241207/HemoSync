import React, { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, AlertCircle, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';

export function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        limit: 50
      };
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;

      const res = await apiClient.getAuditLogs(params);
      setLogs(res.data.logs || []);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 50, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="page-container ops-page">
      <div className="page-header ops-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={22} style={{ color: 'var(--brand-forest)' }} />
            Audit Trail & Compliance
          </h1>
          <p className="page-subtitle">
            Immutable healthcare compliance records of all user actions, allocations, transfers, and inventory mutations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="form-input"
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="STATUS_CHANGE">STATUS_CHANGE</option>
            <option value="ALLOCATE">ALLOCATE</option>
            <option value="TRANSFER_REQUEST">TRANSFER_REQUEST</option>
            <option value="TRANSFER_APPROVE">TRANSFER_APPROVE</option>
            <option value="TRANSFER_DISPATCH">TRANSFER_DISPATCH</option>
            <option value="TRANSFER_RECEIVE">TRANSFER_RECEIVE</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="form-input"
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          >
            <option value="">All Entities</option>
            <option value="BLOOD_UNIT">BLOOD_UNIT</option>
            <option value="BLOOD_REQUEST">BLOOD_REQUEST</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="EXPIRY_ALERT">EXPIRY_ALERT</option>
          </select>

          <button
            onClick={() => fetchLogs(1)}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              <RefreshCw size={16} className="spin" />
              Loading audit trail records...
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No audit logs match current filters.
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Identifier</th>
                  <th>Responsible Actor</th>
                  <th>Institution</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            log.action.includes('DELETE') || log.action.includes('REJECT')
                              ? 'var(--status-danger-bg)'
                              : log.action.includes('ALLOCATE') || log.action.includes('APPROVE')
                              ? 'var(--status-success-bg)'
                              : 'var(--bg-subtle)',
                          color:
                            log.action.includes('DELETE') || log.action.includes('REJECT')
                              ? 'var(--status-danger-text)'
                              : log.action.includes('ALLOCATE') || log.action.includes('APPROVE')
                              ? 'var(--status-success-text)'
                              : 'var(--text-main)',
                          fontWeight: '600'
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{log.entityType}</code>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <code style={{ fontSize: '0.775rem' }}>{log.entityId ? `${log.entityId.slice(0, 10)}...` : 'N/A'}</code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{log.actor?.name || 'System Scheduler'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.actor?.role}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{log.institution?.name || '—'}</td>
                    <td style={{ maxWidth: '280px', fontSize: '0.775rem' }}>
                      <pre style={{ margin: 0, padding: '4px 6px', background: 'var(--bg-subtle)', borderRadius: '4px', overflowX: 'auto', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchLogs(pagination.page - 1)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchLogs(pagination.page + 1)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogsPage;