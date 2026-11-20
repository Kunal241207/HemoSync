import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function UnauthorizedPage() {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: 540, margin: '3rem auto 0' }}>
      <div className="card" style={{ textAlign: 'center', borderColor: 'var(--border-subtle)' }}>
        <div style={{ display: 'inline-flex', padding: '0.85rem', borderRadius: '50%', backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', marginBottom: '1rem' }}>
          <ShieldAlert size={36} />
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
          403 — Unauthorized Access
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Your current account role does not possess the permissions required to view or modify this resource.
        </p>

        {user && (
          <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>AUTHENTICATED IDENTITY</div>
            <div style={{ fontWeight: 600 }}>{user.name} ({user.email})</div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <StatusBadge status="warning" label={`ROLE: ${user.role}`} />
              {user.institution && (
                <StatusBadge status="info" label={user.institution.name} />
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to="/" className="btn btn-primary btn-sm">
            Return to Overview
          </Link>
          <Link to="/health" className="btn btn-secondary btn-sm">
            Diagnostics
          </Link>
        </div>
      </div>
    </div>
  );
}

export default UnauthorizedPage;
