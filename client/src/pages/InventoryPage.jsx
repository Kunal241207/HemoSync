import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, X, Droplet, ArrowLeftRight, Clock3, PackageCheck } from 'lucide-react';
import apiClient from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function InventoryPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'BLOOD_BANK_STAFF' || user?.role === 'PLATFORM_ADMIN';

  // State
  const [units, setUnits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [componentFilter, setComponentFilter] = useState('');
  const [aboFilter, setAboFilter] = useState('');
  const [rhFilter, setRhFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);

  // Register Form
  const [regData, setRegData] = useState({
    unitCode: '',
    componentType: 'RED_BLOOD_CELLS',
    aboGroup: 'O',
    rhFactor: 'NEGATIVE',
    volumeMl: 450,
    collectionDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 42 * 86400000).toISOString().split('T')[0],
    testingStatus: 'PASSED',
    releaseStatus: 'RELEASED',
    inventoryStatus: 'AVAILABLE'
  });
  const [regError, setRegError] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);

  // Status Form
  const [statusAction, setStatusAction] = useState({
    newStatus: 'QUARANTINED',
    notes: ''
  });
  const [statusError, setStatusError] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        sortBy: 'expiryDate',
        order: 'asc'
      };
      if (componentFilter) params.componentType = componentFilter;
      if (aboFilter) params.aboGroup = aboFilter;
      if (rhFilter) params.rhFactor = rhFilter;
      if (statusFilter) params.inventoryStatus = statusFilter;
      if (eligibleOnly) params.isEligible = 'true';
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [invRes, sumRes] = await Promise.all([
        apiClient.getInventory(params),
        apiClient.getInventorySummary()
      ]);

      setUnits(invRes.data?.units || []);
      setSummary(sumRes.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [componentFilter, aboFilter, rhFilter, statusFilter, eligibleOnly]);

  useEffect(() => {
    const openRegistration = () => {
      setRegData((prev) => ({ ...prev, unitCode: `W0365-26-${Math.floor(10000 + Math.random() * 90000)}` }));
      setShowRegisterModal(true);
    };
    window.addEventListener('hemosync:register-unit', openRegistration);
    return () => window.removeEventListener('hemosync:register-unit', openRegistration);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchInventory();
  };

  const handleComponentPreset = (component) => {
    const now = new Date();
    let days = 42;
    let volume = 450;
    if (component === 'PLATELETS') {
      days = 5;
      volume = 280;
    } else if (component === 'PLASMA') {
      days = 365;
      volume = 300;
    }

    setRegData(prev => ({
      ...prev,
      componentType: component,
      volumeMl: volume,
      collectionDate: now.toISOString().split('T')[0],
      expiryDate: new Date(now.getTime() + days * 86400000).toISOString().split('T')[0]
    }));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    setSubmittingReg(true);

    try {
      await apiClient.registerUnit({
        ...regData,
        collectionDate: new Date(regData.collectionDate).toISOString(),
        expiryDate: new Date(regData.expiryDate).toISOString()
      });
      setShowRegisterModal(false);
      setRegData({
        unitCode: '',
        componentType: 'RED_BLOOD_CELLS',
        aboGroup: 'O',
        rhFactor: 'NEGATIVE',
        volumeMl: 450,
        collectionDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 42 * 86400000).toISOString().split('T')[0],
        testingStatus: 'PASSED',
        releaseStatus: 'RELEASED',
        inventoryStatus: 'AVAILABLE'
      });
      await fetchInventory();
    } catch (err) {
      setRegError(err.message || 'Registration failed');
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleStatusOpen = (unit, defaultStatus) => {
    setSelectedUnit(unit);
    setStatusAction({
      newStatus: defaultStatus || (unit.inventoryStatus === 'AVAILABLE' ? 'QUARANTINED' : 'AVAILABLE'),
      notes: ''
    });
    setStatusError('');
    setShowStatusModal(true);
  };

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    setStatusError('');
    setSubmittingStatus(true);

    try {
      await apiClient.updateUnitStatus(selectedUnit.id, statusAction);
      setShowStatusModal(false);
      setSelectedUnit(null);
      await fetchInventory();
    } catch (err) {
      setStatusError(err.message || 'Status transition failed');
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleViewDetails = async (unit) => {
    try {
      const fullRes = await apiClient.getUnitById(unit.id);
      setSelectedUnit(fullRes.data || unit);
      setShowDetailsModal(true);
    } catch (err) {
      alert(`Error loading unit history: ${err.message}`);
    }
  };

  const formatCountdown = (expiryDate) => {
    const diffMs = new Date(expiryDate).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays < 0) return <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>Expired</span>;
    if (diffDays === 0) return <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>Expires today</span>;
    if (diffDays <= 7) return <span style={{ color: 'var(--status-warning-text)', fontWeight: 700 }}>{diffDays} days left</span>;
    return <span style={{ color: 'var(--text-muted)' }}>{diffDays} days left</span>;
  };

  return (
    <div className="inventory-page">
      <div className="inventory-page-heading">
        <span className="inventory-heading-icon"><PackageCheck size={24} strokeWidth={1.8} /></span>
        <div className="inventory-heading-copy">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>Blood Component Inventory & FEFO Dispatch</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Physical unit registration, lifecycle state machine, and First-Expiry-First-Out ordering.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid-3 inventory-summary">
          <div className="card inventory-summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="inventory-summary-title"><Droplet size={18} /> AVAILABLE STOCK</span>
              <StatusBadge status="healthy" label="Transfusion Eligible" />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-success-text)' }}>
              {summary.eligibleUnits} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {summary.totalUnits} total units</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              RBC: {summary.byComponent.RED_BLOOD_CELLS} | PLT: {summary.byComponent.PLATELETS} | FFP: {summary.byComponent.PLASMA}
            </div>
          </div>

          <div className="card inventory-summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="inventory-summary-title"><ArrowLeftRight size={18} /> RESERVED & IN TRANSFER</span>
              <StatusBadge status="warning" label="Committed" />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-warning-text)' }}>
              {summary.byStatus.RESERVED + summary.byStatus.IN_TRANSFER}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Reserved: {summary.byStatus.RESERVED} | In Transit: {summary.byStatus.IN_TRANSFER}
            </div>
          </div>

          <div className="card inventory-summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="inventory-summary-title"><Clock3 size={18} /> EXPIRY & QUARANTINE</span>
              <StatusBadge status="danger" label="Requires Attention" />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {summary.expiringSoon + summary.byStatus.QUARANTINED}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Expiring &lt;7d: {summary.expiringSoon} | Quarantined: {summary.byStatus.QUARANTINED}
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card inventory-filter-panel">
        <form onSubmit={handleSearchSubmit} className="inventory-filter-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Search Barcode</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. W0365..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Component</label>
            <select
              className="form-input"
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
            >
              <option value="">All Components</option>
              <option value="RED_BLOOD_CELLS">Red Blood Cells</option>
              <option value="PLATELETS">Platelets</option>
              <option value="PLASMA">Plasma</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">ABO Group</label>
            <select
              className="form-input"
              value={aboFilter}
              onChange={(e) => setAboFilter(e.target.value)}
            >
              <option value="">All ABO Groups</option>
              <option value="O">O</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Rh Factor</label>
            <select
              className="form-input"
              value={rhFilter}
              onChange={(e) => setRhFilter(e.target.value)}
            >
              <option value="">All Rh Factors</option>
              <option value="NEGATIVE">Negative (-)</option>
              <option value="POSITIVE">Positive (+)</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Unit Status</label>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="EXPIRED">Expired</option>
              <option value="DISCARDED">Discarded</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '38px', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
              />
              <strong>Eligible Only</strong>
            </label>
          </div>
        </form>
      </div>

      {/* Inventory Table (FEFO) */}
      <div className="card inventory-table-panel">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 className="card-title">FEFO Unit Registry ({units.length})</h2>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Sorted by Earliest Expiry First</span>
          </div>
          <button onClick={fetchInventory} disabled={loading} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading physical unit inventory...</p>
        ) : units.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No blood units match the specified filters.</p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Barcode (Unit Code)</th>
                  <th>Blood Group & Component</th>
                  <th>Volume</th>
                  <th>Expiry Date (FEFO)</th>
                  <th>Testing / Release</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="code-inline" style={{ fontWeight: 700 }}>{u.unitCode}</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {u.institution?.name}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge badge-danger" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          {u.aboGroup}{u.rhFactor === 'POSITIVE' ? '+' : '-'}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                          {u.componentType === 'RED_BLOOD_CELLS' ? 'Red Blood Cells' : u.componentType === 'PLATELETS' ? 'Platelets' : 'Plasma'}
                        </span>
                      </div>
                    </td>
                    <td>{u.volumeMl} mL</td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{new Date(u.expiryDate).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.75rem' }}>{formatCountdown(u.expiryDate)}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <StatusBadge
                          status={u.testingStatus === 'PASSED' ? 'healthy' : 'warning'}
                          label={`Test: ${u.testingStatus}`}
                        />
                        <StatusBadge
                          status={u.releaseStatus === 'RELEASED' ? 'healthy' : 'danger'}
                          label={`Rel: ${u.releaseStatus}`}
                        />
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={u.inventoryStatus} label={u.inventoryStatus} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleViewDetails(u)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem' }}
                        >
                          History
                        </button>
                        {canMutate && u.inventoryStatus !== 'DISCARDED' && u.inventoryStatus !== 'USED' && (
                          <>
                            {u.inventoryStatus === 'AVAILABLE' ? (
                              <button
                                onClick={() => handleStatusOpen(u, 'QUARANTINED')}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: 'var(--status-warning-text)' }}
                              >
                                Quarantine
                              </button>
                            ) : u.inventoryStatus === 'QUARANTINED' ? (
                              <button
                                onClick={() => handleStatusOpen(u, 'AVAILABLE')}
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem', backgroundColor: '#15803d' }}
                              >
                                Release
                              </button>
                            ) : null}
                            <button
                              onClick={() => handleStatusOpen(u, 'DISCARDED')}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: 'var(--color-primary)' }}
                            >
                              Discard
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unit Registration Modal */}
      {showRegisterModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header">
              <h2 className="card-title">Register Physical Blood Unit</h2>
              <button
                onClick={() => setShowRegisterModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {regError && (
              <div style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={15} /> {regError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group">
                <label className="form-label">Component Shelf-Life Preset</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => handleComponentPreset('RED_BLOOD_CELLS')}
                    className={`btn btn-sm ${regData.componentType === 'RED_BLOOD_CELLS' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Red Cells (42d)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleComponentPreset('PLATELETS')}
                    className={`btn btn-sm ${regData.componentType === 'PLATELETS' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Platelets (5d)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleComponentPreset('PLASMA')}
                    className={`btn btn-sm ${regData.componentType === 'PLASMA' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Plasma (365d)
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">ISBT-128 Unit Barcode</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={regData.unitCode}
                  onChange={(e) => setRegData(prev => ({ ...prev, unitCode: e.target.value }))}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">ABO Group</label>
                  <select
                    className="form-input"
                    value={regData.aboGroup}
                    onChange={(e) => setRegData(prev => ({ ...prev, aboGroup: e.target.value }))}
                  >
                    <option value="O">O</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Rh Factor</label>
                  <select
                    className="form-input"
                    value={regData.rhFactor}
                    onChange={(e) => setRegData(prev => ({ ...prev, rhFactor: e.target.value }))}
                  >
                    <option value="NEGATIVE">Negative (-)</option>
                    <option value="POSITIVE">Positive (+)</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Volume (mL)</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    value={regData.volumeMl}
                    onChange={(e) => setRegData(prev => ({ ...prev, volumeMl: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expiry Date (FEFO)</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={regData.expiryDate}
                    onChange={(e) => setRegData(prev => ({ ...prev, expiryDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Infectious Disease Testing</label>
                  <select
                    className="form-input"
                    value={regData.testingStatus}
                    onChange={(e) => setRegData(prev => ({ ...prev, testingStatus: e.target.value }))}
                  >
                    <option value="PASSED">PASSED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Release Authorization</label>
                  <select
                    className="form-input"
                    value={regData.releaseStatus}
                    onChange={(e) => setRegData(prev => ({ ...prev, releaseStatus: e.target.value }))}
                  >
                    <option value="RELEASED">RELEASED</option>
                    <option value="QUARANTINED">QUARANTINED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={submittingReg}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submittingReg}
                >
                  {submittingReg ? 'Registering...' : 'Confirm Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedUnit && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', margin: '1rem' }}>
            <div className="card-header">
              <h2 className="card-title">Transition Unit: {selectedUnit.unitCode}</h2>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {statusError && (
              <div style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={15} /> {statusError}
              </div>
            )}

            <form onSubmit={handleStatusSubmit}>
              <div className="form-group">
                <label className="form-label">Current Status</label>
                <div style={{ marginBottom: '0.5rem' }}>
                  <StatusBadge status={selectedUnit.inventoryStatus} label={selectedUnit.inventoryStatus} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Target Lifecycle Status</label>
                <select
                  className="form-input"
                  value={statusAction.newStatus}
                  onChange={(e) => setStatusAction(prev => ({ ...prev, newStatus: e.target.value }))}
                >
                  <option value="AVAILABLE">AVAILABLE (Release for transfusion)</option>
                  <option value="QUARANTINED">QUARANTINED (Hold / Investigation)</option>
                  <option value="DISCARDED">DISCARDED (Biohazard disposal)</option>
                  <option value="EXPIRED">EXPIRED (Past shelf life)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Mandatory Clinical / Lab Note</label>
                <textarea
                  required
                  rows={3}
                  className="form-input"
                  placeholder="Detail reason for status modification..."
                  value={statusAction.notes}
                  onChange={(e) => setStatusAction(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={submittingStatus}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submittingStatus}
                >
                  {submittingStatus ? 'Saving...' : 'Apply Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History & Event Timeline Modal */}
      {showDetailsModal && selectedUnit && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header">
              <div>
                <h2 className="card-title">Unit History: {selectedUnit.unitCode}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedUnit.componentType} • {selectedUnit.aboGroup}{selectedUnit.rhFactor === 'POSITIVE' ? '+' : '-'} • {selectedUnit.volumeMl} mL
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-subtle)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>Collected: <strong>{new Date(selectedUnit.collectionDate).toLocaleDateString()}</strong></span>
                <span>Expiry: <strong>{new Date(selectedUnit.expiryDate).toLocaleDateString()}</strong></span>
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Immutable Lifecycle Events ({selectedUnit.inventoryEvents?.length || 0})
            </h3>

            {(!selectedUnit.inventoryEvents || selectedUnit.inventoryEvents.length === 0) ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No history events recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedUnit.inventoryEvents.map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      borderLeft: '3px solid var(--color-primary)',
                      paddingLeft: '0.85rem',
                      paddingTop: '0.2rem',
                      paddingBottom: '0.2rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{evt.eventType}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(evt.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                      Status: <span className="code-inline">{evt.previousStatus || 'INIT'} &rarr; {evt.newStatus}</span>
                    </div>
                    {evt.notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                        "{evt.notes}"
                      </div>
                    )}
                    {evt.actor && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>
                        Staff Actor: {evt.actor.name} ({evt.actor.role})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPage;
