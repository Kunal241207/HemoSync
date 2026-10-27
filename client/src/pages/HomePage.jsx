import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          HemoSync Blood Logistics & Forecasting
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Hospital-to-blood-bank inventory management, deterministic compatibility matching, and AI demand forecasting.
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>MODULE 4 DIRECTORY</span>
            <StatusBadge status="verified" label="Complete" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Institutions & Geolocation
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Haversine proximity ranking & verification.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>MODULE 5 INVENTORY</span>
            <StatusBadge status="healthy" label="Complete" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            FEFO Blood Inventory
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Physical units, state machine & event audit.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>NEXT STAGE</span>
            <StatusBadge status="pending" label="Module 6" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Hospital Blood Requests
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Awaiting user sign-off to proceed to Module 6.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Blood Component Inventory Management (Module 5)</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to="/inventory" className="btn btn-primary btn-sm">
              Open Inventory Dashboard
            </Link>
            <Link to="/institutions" className="btn btn-secondary btn-sm">
              Network Directory
            </Link>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Physical blood units are tracked individually using ISBT-128 barcoded identifiers. Status transitions obey a strict finite-state machine, and inventory queries enforce First-Expiry-First-Out (FEFO) ordering.
        </p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Safety Mechanism</th>
                <th>Implementation Standard</th>
                <th>Enforcement Rules</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>First-Expiry, First-Out (FEFO)</strong></td>
                <td>Ordering by earliest UTC expiryDate</td>
                <td>Prevents wastage by prioritizing oldest eligible units</td>
                <td><StatusBadge status="healthy" label="Active" /></td>
              </tr>
              <tr>
                <td><strong>State Machine Lifecycle</strong></td>
                <td>Explicit transition table (AVAILABLE, QUARANTINED, DISCARDED, etc.)</td>
                <td>Disallowed transitions (e.g. DISCARDED ➔ AVAILABLE) are rejected</td>
                <td><StatusBadge status="healthy" label="Enforced" /></td>
              </tr>
              <tr>
                <td><strong>Eligibility Decoupling</strong></td>
                <td>Inventory status separate from testingStatus and releaseStatus</td>
                <td>Unit cannot be AVAILABLE if testing is PENDING/FAILED or unreleased</td>
                <td><StatusBadge status="healthy" label="Active" /></td>
              </tr>
              <tr>
                <td><strong>Event Traceability</strong></td>
                <td>PostgreSQL `inventory_events` table</td>
                <td>Immutable event log (REGISTRATION, STATUS_CHANGE, DISPOSAL) with actor ID</td>
                <td><StatusBadge status="healthy" label="Audited" /></td>
              </tr>
              <tr>
                <td><strong>Institution Scoping</strong></td>
                <td>Staff accounts locked to their institution ID</td>
                <td>Blood bank staff cannot mutate or view another institution's stock</td>
                <td><StatusBadge status="healthy" label="Enforced" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
