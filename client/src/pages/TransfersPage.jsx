import React, { useState, useEffect, useCallback } from 'react';
import { Truck, CheckCircle2, ArrowRight, RefreshCw, ArrowDownLeft, ArrowUpRight, Check, X, Clock, AlertTriangle } from 'lucide-react';
import apiClient from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function TransfersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const isHospitalStaff = user?.role === 'HOSPITAL_STAFF';
  const isBloodBankStaff = user?.role === 'BLOOD_BANK_STAFF';

  // Data state
  const [transfers, setTransfers] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState('all'); // 'all', 'incoming', 'outgoing'
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [dispatchData, setDispatchData] = useState({
    courier: 'BioTransport Logistics',
    trackingNumber: '',
    dispatchNotes: 'Cold box maintained at 2-6°C with continuous temperature logger'
  });
  const [receiveData, setReceiveData] = useState({
    temperatureChecked: true,
    packagingIntact: true,
    conditionNotes: 'Arrived intact within validated temperature boundaries'
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { roleFilter };
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const [transRes, instRes] = await Promise.all([
        apiClient.getTransfers(params),
        apiClient.getInstitutions({ limit: 50 }).catch(() => ({ data: { institutions: [] } }))
      ]);

      setTransfers(transRes?.data?.transfers || []);
      setInstitutions(instRes?.data?.institutions || []);
    } catch (err) {
      setError(err.message || 'Failed to load transfer records');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenDetails = async (id) => {
    setActionLoading(true);
    try {
      const res = await apiClient.getTransferById(id);
      setSelectedTransfer(res.data);
      setIsDetailModalOpen(true);
    } catch (err) {
      setError(err.message || 'Failed to load transfer details');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.approveTransfer(selectedTransfer.id, { notes: approveNotes });
      setSuccessMessage(`Transfer #${selectedTransfer.id.slice(0, 8)} approved and units reserved!`);
      setIsApproveModalOpen(false);
      setApproveNotes('');
      const updated = await apiClient.getTransferById(selectedTransfer.id);
      setSelectedTransfer(updated.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to approve transfer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.rejectTransfer(selectedTransfer.id, { reason: rejectReason });
      setSuccessMessage(`Transfer #${selectedTransfer.id.slice(0, 8)} rejected. Reserved units released.`);
      setIsRejectModalOpen(false);
      setRejectReason('');
      const updated = await apiClient.getTransferById(selectedTransfer.id);
      setSelectedTransfer(updated.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to reject transfer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.dispatchTransfer(selectedTransfer.id, dispatchData);
      setSuccessMessage(`Transfer #${selectedTransfer.id.slice(0, 8)} dispatched in transit!`);
      setIsDispatchModalOpen(false);
      const updated = await apiClient.getTransferById(selectedTransfer.id);
      setSelectedTransfer(updated.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to record dispatch');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.receiveTransfer(selectedTransfer.id, receiveData);
      setSuccessMessage(
        `Transfer #${selectedTransfer.id.slice(0, 8)} delivery confirmed! Physical inventory ownership updated to destination hospital.`
      );
      setIsReceiveModalOpen(false);
      const updated = await apiClient.getTransferById(selectedTransfer.id);
      setSelectedTransfer(updated.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to confirm delivery receipt');
    } finally {
      setActionLoading(false);
    }
  };

  // KPI Calculations
  const requestedCount = transfers.filter((t) => t.status === 'REQUESTED').length;
  const approvedCount = transfers.filter((t) => t.status === 'APPROVED' || t.status === 'RESERVED').length;
  const dispatchedCount = transfers.filter((t) => t.status === 'DISPATCHED').length;
  const completedCount = transfers.filter((t) => t.status === 'RECEIVED').length;

  const isSourceUser = (t) => isAdmin || t.sourceInstitutionId === user?.institutionId;
  const isDestinationUser = (t) => isAdmin || t.destinationInstitutionId === user?.institutionId;

  return (
    <div className="transfers-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Inter-Institution Blood Transfer Coordination
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Coordinate blood component logistics between licensed blood banks and participating hospitals with full chain-of-custody tracking.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
          <strong>Success:</strong> {successMessage}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Transfers
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
            {transfers.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            All active & completed shipments
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--status-warning-text)', fontWeight: 600, textTransform: 'uppercase' }}>
            Pending Approval
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-warning-text)', marginTop: '0.25rem' }}>
            {requestedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Awaiting source authorization
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Truck size={13} /> Dispatched In-Transit
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1d4ed8', marginTop: '0.25rem' }}>
            {dispatchedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Active physical courier transit
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={13} /> Delivered & Handed Over
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#15803d', marginTop: '0.25rem' }}>
            {completedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Ownership transferred to hospital
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Direction Filter Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
              Direction:
            </span>
            {[
              { id: 'all', label: 'All Transfers' },
              { id: 'incoming', label: 'Incoming to Us' },
              { id: 'outgoing', label: 'Outgoing from Us' }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`btn btn-sm ${roleFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRoleFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved / Reserved</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="RECEIVED">Received</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button className="btn btn-secondary btn-sm" onClick={fetchData} title="Refresh transfers" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Transfers Data Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            Transfer Shipments ({transfers.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading transfers...
          </div>
        ) : transfers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Truck size={36} style={{ opacity: 0.5, margin: '0 auto 0.5rem auto' }} />
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>No transfer records found</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Transfers can be initiated from the Blood Requests dashboard when local inventory has a shortage.
            </p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transfer ID</th>
                  <th>Source Institution</th>
                  <th>Destination Hospital</th>
                  <th>Units & Component</th>
                  <th>Status</th>
                  <th>Timeline</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => {
                  const units = tr.transferUnits || [];
                  const sampleUnit = units[0]?.bloodUnit;

                  return (
                    <tr key={tr.id}>
                      <td>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            backgroundColor: 'var(--bg-subtle)',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem'
                          }}
                        >
                          {tr.id.slice(0, 8)}
                        </span>
                        {tr.requestId && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Req: #{tr.requestId.slice(0, 8)}
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>{tr.sourceInstitution?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {tr.sourceInstitution?.type === 'BLOOD_BANK' ? 'Blood Bank' : 'Hospital'}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>{tr.destinationInstitution?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {tr.destinationInstitution?.address}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700 }}>
                          {units.length} {units.length === 1 ? 'unit' : 'units'}
                        </div>
                        {sampleUnit && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                            {sampleUnit.aboGroup}{sampleUnit.rhFactor === 'POSITIVE' ? '+' : '-'} {sampleUnit.componentType}
                          </div>
                        )}
                      </td>

                      <td>
                        <StatusBadge status={tr.status} label={tr.status.replace(/_/g, ' ')} />
                      </td>

                      <td>
                        {tr.status === 'RECEIVED' ? (
                          <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                            Delivered {new Date(tr.receivedAt).toLocaleDateString()}
                          </div>
                        ) : tr.status === 'DISPATCHED' ? (
                          <div style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600 }}>
                            Dispatched {new Date(tr.dispatchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Requested {new Date(tr.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenDetails(tr.id)}
                          >
                            Track & Details
                          </button>

                          {/* Source Staff Action: Approve / Reject */}
                          {isSourceUser(tr) && tr.status === 'REQUESTED' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setSelectedTransfer(tr);
                                setIsApproveModalOpen(true);
                              }}
                            >
                              Approve
                            </button>
                          )}

                          {/* Source Staff Action: Dispatch */}
                          {isSourceUser(tr) && tr.status === 'APPROVED' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setSelectedTransfer(tr);
                                setIsDispatchModalOpen(true);
                              }}
                            >
                              Record Dispatch
                            </button>
                          )}

                          {/* Destination Staff Action: Receive */}
                          {isDestinationUser(tr) && tr.status === 'DISPATCHED' && (
                            <button
                              className="btn btn-sm"
                              style={{ backgroundColor: '#15803d', color: '#fff' }}
                              onClick={() => {
                                setSelectedTransfer(tr);
                                setIsReceiveModalOpen(true);
                              }}
                            >
                              Confirm Receipt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TRANSFER DETAILS & TRACKING MODAL */}
      {isDetailModalOpen && selectedTransfer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '780px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 className="modal-title">Transfer Shipment #{selectedTransfer.id.slice(0, 8)}</h2>
                <StatusBadge status={selectedTransfer.status} label={selectedTransfer.status.replace(/_/g, ' ')} />
              </div>
              <button className="btn-close" onClick={() => setIsDetailModalOpen(false)}>×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Haversine Disclaimer */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: '#1e40af'
                }}
              >
                <strong>ℹ️ Distance & Logistics Disclaimer:</strong> {selectedTransfer.disclaimer || 'Haversine distance is approximate straight-line distance only and does not reflect driving distance, transit traffic, or guaranteed delivery ETA.'}
              </div>

              {/* Institution Journey Overview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: '1rem',
                  alignItems: 'center',
                  padding: '1rem',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Source Institution (Origin)</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedTransfer.sourceInstitution?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedTransfer.sourceInstitution?.address}</div>
                </div>

                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowRight size={20} style={{ color: 'var(--brand-forest)' }} />
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-forest)', marginTop: '0.25rem' }}>
                    ~{selectedTransfer.distanceKm ?? '?'} km
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Destination Hospital</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedTransfer.destinationInstitution?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedTransfer.destinationInstitution?.address}</div>
                </div>
              </div>

              {/* Chain of Custody Pipeline */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  Chain of Custody Pipeline
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#fff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  {[
                    { step: 1, name: 'Requested', key: 'REQUESTED' },
                    { step: 2, name: 'Approved & Reserved', key: 'APPROVED' },
                    { step: 3, name: 'Dispatched In-Transit', key: 'DISPATCHED' },
                    { step: 4, name: 'Delivered & Handed Over', key: 'RECEIVED' }
                  ].map((s, idx, arr) => {
                    const isPassed =
                      (s.key === 'REQUESTED') ||
                      (s.key === 'APPROVED' && ['APPROVED', 'RESERVED', 'DISPATCHED', 'RECEIVED'].includes(selectedTransfer.status)) ||
                      (s.key === 'DISPATCHED' && ['DISPATCHED', 'RECEIVED'].includes(selectedTransfer.status)) ||
                      (s.key === 'RECEIVED' && selectedTransfer.status === 'RECEIVED');

                    const isCurrent = selectedTransfer.status === s.key;

                    return (
                      <React.Fragment key={s.name}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: isCurrent ? 'var(--color-primary)' : isPassed ? '#15803d' : 'var(--border-subtle)',
                              color: isPassed || isCurrent ? '#fff' : 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.8rem'
                            }}
                          >
                            {isPassed && !isCurrent ? <Check size={14} /> : s.step}
                          </div>
                          <span style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: isCurrent ? 700 : 500, textAlign: 'center' }}>
                            {s.name}
                          </span>
                        </div>
                        {idx < arr.length - 1 && (
                          <div
                            style={{
                              flex: 1,
                              height: '2px',
                              backgroundColor: isPassed ? '#15803d' : 'var(--border-subtle)',
                              margin: '0 0.5rem'
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Transferred Units Table */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Transferred Physical Units ({selectedTransfer.transferUnits?.length || 0})
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ISBT-128 Barcode</th>
                        <th>Component & Group</th>
                        <th>Volume</th>
                        <th>Expiry Date</th>
                        <th>Current Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.transferUnits?.map((tu) => (
                        <tr key={tu.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tu.bloodUnit?.unitCode}</td>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {tu.bloodUnit?.aboGroup}{tu.bloodUnit?.rhFactor === 'POSITIVE' ? '+' : '-'}
                            </span>{' '}
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {tu.bloodUnit?.componentType}
                            </span>
                          </td>
                          <td>{tu.bloodUnit?.volumeMl} mL</td>
                          <td>{new Date(tu.bloodUnit?.expiryDate).toLocaleDateString()}</td>
                          <td><StatusBadge status={tu.bloodUnit?.inventoryStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedTransfer.notes && (
                <div style={{ padding: '0.75rem', backgroundColor: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.85rem' }}>
                  <strong>Logistics & Verification Trail:</strong>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>{selectedTransfer.notes}</div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                {/* Source actions */}
                {isSourceUser(selectedTransfer) && selectedTransfer.status === 'REQUESTED' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setIsApproveModalOpen(true)}
                    >
                      Approve Transfer
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: '#b91c1c', border: '1px solid #fecaca', backgroundColor: '#fef2f2' }}
                      onClick={() => setIsRejectModalOpen(true)}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {isSourceUser(selectedTransfer) && selectedTransfer.status === 'APPROVED' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsDispatchModalOpen(true)}
                  >
                    Record Dispatch
                  </button>
                )}

                {/* Destination actions */}
                {isDestinationUser(selectedTransfer) && selectedTransfer.status === 'DISPATCHED' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ backgroundColor: '#15803d', color: '#fff' }}
                    onClick={() => setIsReceiveModalOpen(true)}
                  >
                    Confirm Delivery Receipt
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsDetailModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {isApproveModalOpen && selectedTransfer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title">Approve Transfer #{selectedTransfer.id.slice(0, 8)}</h2>
              <button className="btn-close" onClick={() => setIsApproveModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Approving this transfer will atomically reserve the selected physical blood units at your blood bank.
              </p>
              <div className="form-group">
                <label className="form-label">Approval Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Cleared for dispatch by logistics supervisor"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsApproveModalOpen(false)}>Back</button>
              <button type="button" className="btn btn-primary" onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? 'Approving...' : 'Confirm Approval & Reserve Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {isRejectModalOpen && selectedTransfer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#b91c1c' }}>Reject Transfer #{selectedTransfer.id.slice(0, 8)}</h2>
              <button className="btn-close" onClick={() => setIsRejectModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Please specify a clinical or logistical justification for rejecting this transfer request.
              </p>
              <div className="form-group">
                <label className="form-label">Rejection Reason</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Critical local trauma shortage requires keeping units"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsRejectModalOpen(false)}>Back</button>
              <button type="button" className="btn btn-primary" style={{ backgroundColor: '#b91c1c' }} onClick={handleReject} disabled={actionLoading}>
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPATCH MODAL */}
      {isDispatchModalOpen && selectedTransfer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title">Record Dispatch #{selectedTransfer.id.slice(0, 8)}</h2>
              <button className="btn-close" onClick={() => setIsDispatchModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Medical Transport Courier *</label>
                <input
                  type="text"
                  className="form-control"
                  value={dispatchData.courier}
                  onChange={(e) => setDispatchData({ ...dispatchData, courier: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Waybill / Tracking Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. BIO-2026-88192"
                  value={dispatchData.trackingNumber}
                  onChange={(e) => setDispatchData({ ...dispatchData, trackingNumber: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cold-Chain Packaging & Dispatch Notes</label>
                <input
                  type="text"
                  className="form-control"
                  value={dispatchData.dispatchNotes}
                  onChange={(e) => setDispatchData({ ...dispatchData, dispatchNotes: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsDispatchModalOpen(false)}>Back</button>
              <button type="button" className="btn btn-primary" onClick={handleDispatch} disabled={actionLoading}>
                {actionLoading ? 'Dispatching...' : 'Confirm Dispatch & Release to Courier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE MODAL */}
      {isReceiveModalOpen && selectedTransfer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#15803d' }}>
                Confirm Delivery Receipt #{selectedTransfer.id.slice(0, 8)}
              </h2>
              <button className="btn-close" onClick={() => setIsReceiveModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  color: '#166534'
                }}
              >
                <strong>Handover Protocol:</strong> Confirming receipt will officially transfer physical inventory ownership of all units into your hospital repository.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={receiveData.temperatureChecked}
                    onChange={(e) => setReceiveData({ ...receiveData, temperatureChecked: e.target.checked })}
                  />
                  <span>Cold chain verified within compliant clinical temperature range (2–6°C / -18°C)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={receiveData.packagingIntact}
                    onChange={(e) => setReceiveData({ ...receiveData, packagingIntact: e.target.checked })}
                  />
                  <span>Packaging integrity, security seals, and ISBT-128 labels intact</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Receipt Verification Notes</label>
                <input
                  type="text"
                  className="form-control"
                  value={receiveData.conditionNotes}
                  onChange={(e) => setReceiveData({ ...receiveData, conditionNotes: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsReceiveModalOpen(false)}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ backgroundColor: '#15803d', borderColor: '#166534' }}
                onClick={handleReceive}
                disabled={actionLoading}
              >
                {actionLoading ? 'Confirming...' : 'Accept Delivery & Handover Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransfersPage;
