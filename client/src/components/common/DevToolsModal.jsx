import React, { useState, useEffect } from 'react';
import apiClient from '../../services/api';
import { Terminal, X, Database, Activity, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export function DevToolsModal({ isOpen, onClose, wsConnected }) {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reseedLoading, setReseedLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getHealth();
      setHealthData(res?.data || res);
      setStatusMessage('');
    } catch (err) {
      setStatusMessage(`Health check failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  const handleReseed = async () => {
    if (!window.confirm('Reset and generate reproducible test data?')) return;
    setReseedLoading(true);
    setStatusMessage('');
    try {
      await apiClient.post('/forecasts/seed-synthetic', { days: 90, force: true });
      setStatusMessage('Test data re-seeded successfully. Refreshing view...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setStatusMessage(`Reseed failed: ${err.message}`);
    } finally {
      setReseedLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} color="var(--forest-green)" />
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Diagnostic Console</p>
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Developer & System Tools</h2>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {statusMessage && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: statusMessage.includes('failed') ? 'var(--status-danger-bg)' : 'var(--status-success-bg)',
            color: statusMessage.includes('failed') ? 'var(--status-danger-text)' : 'var(--status-success-text)'
          }}>
            {statusMessage.includes('failed') ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>
          <div className="metric-card" style={{ padding: '12px' }}>
            <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={12} /> Live WebSocket
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className={`status-dot ${wsConnected ? '' : 'disconnected'}`} />
              <strong style={{ fontSize: '1rem' }}>{wsConnected ? 'Connected' : 'Offline'}</strong>
            </div>
          </div>

          <div className="metric-card" style={{ padding: '12px' }}>
            <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Database size={12} /> Database Latency
            </span>
            <strong style={{ fontSize: '1rem', marginTop: '4px' }}>
              {healthData?.database?.latencyMs != null ? `${healthData.database.latencyMs} ms` : (loading ? 'Testing...' : 'Connected')}
            </strong>
          </div>
        </div>

        <div className="card" style={{ padding: '14px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700 }}>System Health Diagnostic</span>
            <button className="btn btn-secondary btn-sm" onClick={fetchHealth} disabled={loading}>
              <RefreshCw size={12} className={loading ? 'spin-icon' : ''} />
              <span>{loading ? 'Pinging...' : 'Ping Server'}</span>
            </button>
          </div>
          <pre style={{ margin: 0, padding: '10px', fontSize: '11px', maxHeight: 150, overflowY: 'auto' }}>
            {JSON.stringify(healthData || { status: 'Checking...' }, null, 2)}
          </pre>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleReseed}
            disabled={reseedLoading}
          >
            {reseedLoading ? 'Reseeding...' : 'Reseed Demo Data'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DevToolsModal;
