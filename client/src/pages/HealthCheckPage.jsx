import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Server, Database, Cpu } from 'lucide-react';
import apiClient from '../services/api';
import StatusBadge from '../components/common/StatusBadge';

export function HealthCheckPage() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getHealth();
      setHealthData(response.data || response);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message || 'Failed to reach backend health endpoint');
      if (err.data) {
        setHealthData(err.data.data || err.data);
      }
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            System Diagnostics & Health Check
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Live status from backend Express endpoint: <code className="code-inline">GET /api/health</code>
          </p>
        </div>
        <button onClick={fetchHealth} disabled={loading} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          {loading ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      {lastChecked && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Last checked at: <strong>{lastChecked}</strong>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--color-primary-border)', backgroundColor: 'var(--color-primary-subtle)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.25rem' }}>
            Health Check Advisory
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{error}</p>
        </div>
      )}

      {loading && !healthData ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Querying backend service...</p>
        </div>
      ) : healthData ? (
        <>
          <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>API STATUS</span>
                <StatusBadge status={healthData.status} label={healthData.status?.toUpperCase()} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{healthData.service}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Uptime: {healthData.uptimeSeconds}s | Env: {healthData.environment}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>DATABASE</span>
                <StatusBadge
                  status={healthData.database?.connected ? 'healthy' : 'degraded'}
                  label={healthData.database?.connected ? 'CONNECTED' : 'DISCONNECTED'}
                />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>PostgreSQL (Prisma)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {healthData.database?.connected
                  ? `Latency: ${healthData.database.latencyMs}ms`
                  : `Notice: ${healthData.database?.error || 'Database pending setup'}`}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>NODE RUNTIME</span>
                <StatusBadge status="active" label={healthData.system?.nodeVersion} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Heap: {healthData.system?.memoryUsageMb} MB</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Timestamp: {new Date(healthData.timestamp).toUTCString()}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title" style={{ marginBottom: '1rem' }}>Raw JSON Response</h2>
            <pre>{JSON.stringify(healthData, null, 2)}</pre>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default HealthCheckPage;
