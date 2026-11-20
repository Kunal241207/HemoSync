import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, AlertCircle, AlertTriangle, Clock, ClipboardList, CheckCircle2, Truck, ArrowRight, MapPin, X, Check, MessageSquare, Timer, CalendarClock, Droplet, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import apiClient from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function RequestsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isHospitalStaff = user?.role === 'HOSPITAL_STAFF';
  const isBloodBankStaff = user?.role === 'BLOOD_BANK_STAFF';
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const canCreateRequest = isHospitalStaff || isAdmin;
  const canAllocate = isHospitalStaff || isBloodBankStaff || isAdmin;

  // Requests and summary data state
  const [requests, setRequests] = useState([]);
  const [requestPagination, setRequestPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filters
  const [componentFilter, setComponentFilter] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isValidateModalOpen, setIsValidateModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [validationNotes, setValidationNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Module 7: Matching Engine State
  const [activeMatchingTab, setActiveMatchingTab] = useState('local'); // 'local' | 'nearby'
  const [matchesData, setMatchesData] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [nearbyData, setNearbyData] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [matchingInstitutionId, setMatchingInstitutionId] = useState('');
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);
  const [allocationNotes, setAllocationNotes] = useState('');

  // New Request Form State
  const defaultRequiredBy = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    requestedComponent: 'RED_BLOOD_CELLS',
    requestedABO: 'O',
    requestedRh: 'NEGATIVE',
    requestedQuantity: 2,
    urgency: 'ROUTINE',
    requiredBy: defaultRequiredBy(),
    reason: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (componentFilter !== 'ALL') params.componentType = componentFilter;
      if (urgencyFilter !== 'ALL') params.urgency = urgencyFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      params.page = currentPage;
      params.limit = pageSize;

      const institutionPromise = isAdmin
        ? apiClient.getInstitutions({ limit: 100 }).catch(() => ({ data: { institutions: [] } }))
        : Promise.resolve({
            data: {
              institutions: user?.institutionId
                ? [{
                    id: user.institutionId,
                    name: user.institution?.name || 'My Institution',
                    type: user.institution?.type || (isHospitalStaff ? 'HOSPITAL' : 'BLOOD_BANK')
                  }]
                : []
            }
          });

      const [requestsRes, summaryRes, instRes] = await Promise.all([
        apiClient.getRequests(params),
        apiClient.getRequestSummary(),
        institutionPromise
      ]);

      const requestData = requestsRes?.data || {};
      setRequests(requestData.requests || []);
      setRequestPagination(requestData.pagination || {
        total: (requestData.requests || []).length,
        page: currentPage,
        limit: pageSize,
        totalPages: 1
      });
      setSummary(summaryRes?.data || null);
      setInstitutions(instRes?.data?.institutions || (Array.isArray(instRes?.data) ? instRes.data : []));
    } catch (err) {
      setError(err.message || 'Failed to load blood requests');
    } finally {
      setLoading(false);
    }
  }, [componentFilter, urgencyFilter, statusFilter, searchTerm, currentPage, pageSize, isAdmin, isHospitalStaff, user?.institutionId, user?.institution?.name, user?.institution?.type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch matches for a specific request
  const fetchMatches = useCallback(async (reqId, instId = '') => {
    setMatchesLoading(true);
    try {
      const params = {};
      if (instId) params.institutionId = instId;
      const res = await apiClient.getRequestMatches(reqId, params);
      setMatchesData(res.data);
      setSelectedUnitIds([]);
    } catch (err) {
      setError(err.message || 'Failed to find matching inventory');
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  const fetchNearbyMatches = useCallback(async (reqId) => {
    setNearbyLoading(true);
    try {
      const res = await apiClient.getNearbyMatches(reqId);
      setNearbyData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to search nearby blood banks');
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  const handleRequestTransfer = async (instId, unitIds) => {
    if (!selectedRequest) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.createTransfer({
        requestId: selectedRequest.id,
        sourceInstitutionId: instId,
        unitIds,
        notes: `Transfer requested for requisition #${selectedRequest.id.slice(0, 8)}`
      });
      setSuccessMessage(
        `Transfer #${res.data?.id?.slice(0, 8)} submitted to ${res.data?.sourceInstitution?.name || 'source'}! Requisition status updated to TRANSFER_PENDING.`
      );
      const updatedReq = await apiClient.getRequestById(selectedRequest.id);
      setSelectedRequest(updatedReq.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err) {
      setError(err.message || 'Failed to request transfer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDetails = async (reqId) => {
    setActionLoading(true);
    setActiveMatchingTab('local');
    try {
      const res = await apiClient.getRequestById(reqId);
      setSelectedRequest(res.data);
      setIsDetailModalOpen(true);
      // Auto-fetch matches for open requests
      if (!['FULFILLED', 'CANCELLED', 'UNFULFILLED'].includes(res.data.status)) {
        const initialInst = !isAdmin && user?.institutionId
          ? user.institutionId
          : (isBloodBankStaff && user?.institutionId ? user.institutionId : res.data.hospitalId);
        setMatchingInstitutionId(initialInst);
        fetchMatches(reqId, initialInst);
        fetchNearbyMatches(reqId);
      } else {
        setMatchesData(null);
        setNearbyData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch request details');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const selectedView = searchParams.get('view');
    if (selectedView) {
      handleOpenDetails(selectedView);
    }
  }, [searchParams]);

  const handleMatchingInstitutionChange = (newInstId) => {
    if (!isAdmin && user?.institutionId && newInstId !== user.institutionId) return;
    setMatchingInstitutionId(newInstId);
    if (selectedRequest) {
      fetchMatches(selectedRequest.id, newInstId);
    }
  };

  const handleToggleSelectUnit = (unitId) => {
    setSelectedUnitIds((prev) => {
      if (prev.includes(unitId)) {
        return prev.filter((id) => id !== unitId);
      }
      if (selectedRequest && prev.length >= selectedRequest.remainingQuantity) {
        return prev; // Prevent selecting more than remaining shortage
      }
      return [...prev, unitId];
    });
  };

  const handleAllocateSelected = async () => {
    if (!selectedRequest || selectedUnitIds.length === 0) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await apiClient.allocateUnits(selectedRequest.id, {
        unitIds: selectedUnitIds,
        notes: allocationNotes || 'Staff confirmed FEFO reservation'
      });

      setSuccessMessage(`Successfully allocated ${res.data.allocatedCount} unit(s) to requisition #${selectedRequest.id.slice(0, 8)}!`);
      setAllocationNotes('');
      setSelectedUnitIds([]);

      // Refresh details and matches
      const updatedReq = await apiClient.getRequestById(selectedRequest.id);
      setSelectedRequest(updatedReq.data);
      if (matchingInstitutionId) {
        fetchMatches(selectedRequest.id, matchingInstitutionId);
      }
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to allocate units');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAllocateTopFEFO = async () => {
    if (!selectedRequest || !matchesData || matchesData.candidateUnits.length === 0) return;
    setActionLoading(true);
    setError(null);

    try {
      const unitsToAllocate = matchesData.candidateUnits.slice(0, selectedRequest.remainingQuantity).map((u) => u.id);
      const res = await apiClient.allocateUnits(selectedRequest.id, {
        unitIds: unitsToAllocate,
        notes: allocationNotes || 'Auto-allocated top FEFO candidate units'
      });

      setSuccessMessage(`Successfully allocated ${res.data.allocatedCount} unit(s) to requisition #${selectedRequest.id.slice(0, 8)}!`);
      setAllocationNotes('');
      setSelectedUnitIds([]);

      // Refresh details and matches
      const updatedReq = await apiClient.getRequestById(selectedRequest.id);
      setSelectedRequest(updatedReq.data);
      if (matchingInstitutionId) {
        fetchMatches(selectedRequest.id, matchingInstitutionId);
      }
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to allocate units');
    } finally {
      setActionLoading(false);
    }
  };

  // Quick preset handlers for required-by time
  const applyTimePreset = (hours, urgencyLevel) => {
    const d = new Date(Date.now() + hours * 60 * 60 * 1000);
    setFormData((prev) => ({
      ...prev,
      urgency: urgencyLevel,
      requiredBy: d.toISOString().slice(0, 16)
    }));
  };

  const applyReasonPreset = (presetText) => {
    setFormData((prev) => ({ ...prev, reason: presetText }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        requestedQuantity: parseInt(formData.requestedQuantity, 10),
        requiredBy: new Date(formData.requiredBy).toISOString()
      };

      await apiClient.createRequest(payload);
      setSuccessMessage('Blood request submitted successfully!');
      setIsCreateModalOpen(false);
      setFormData({
        requestedComponent: 'RED_BLOOD_CELLS',
        requestedABO: 'O',
        requestedRh: 'NEGATIVE',
        requestedQuantity: 2,
        urgency: 'ROUTINE',
        requiredBy: defaultRequiredBy(),
        reason: ''
      });
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to submit blood request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (e) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setActionLoading(true);

    try {
      await apiClient.cancelRequest(selectedRequest.id, { reason: cancelReason });
      setSuccessMessage(`Blood request ${selectedRequest.id.slice(0, 8)} cancelled successfully`);
      setIsCancelModalOpen(false);
      setIsDetailModalOpen(false);
      setCancelReason('');
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to cancel blood request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleValidateRequest = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);

    try {
      await apiClient.updateRequestStatus(selectedRequest.id, {
        status: 'VALIDATED',
        notes: validationNotes || 'Clinical validation confirmed'
      });
      setSuccessMessage(`Blood request ${selectedRequest.id.slice(0, 8)} validated successfully`);
      setIsValidateModalOpen(false);
      setValidationNotes('');
      const updatedReq = await apiClient.getRequestById(selectedRequest.id);
      setSelectedRequest(updatedReq.data);
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to validate blood request');
    } finally {
      setActionLoading(false);
    }
  };

  const getUrgencyBadge = (urgency) => {
    if (urgency === 'EMERGENCY') {
      return (
        <span className="badge request-urgency-badge emergency">
          <AlertTriangle size={12} /> EMERGENCY
        </span>
      );
    }
    if (urgency === 'URGENT') {
      return (
        <span className="badge request-urgency-badge urgent">
          <Clock size={12} /> URGENT
        </span>
      );
    }
    return (
      <span className="badge request-urgency-badge routine">
        ROUTINE
      </span>
    );
  };

  const formatCountdown = (dateString) => {
    const diff = new Date(dateString) - new Date();
    if (diff <= 0) {
      return <span style={{ color: '#b91c1c', fontWeight: 700 }}>OVERDUE</span>;
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours < 4) {
      return <span style={{ color: '#b91c1c', fontWeight: 700 }}>In {hours}h {mins}m</span>;
    }
    if (hours < 24) {
      return <span style={{ color: '#b45309', fontWeight: 600 }}>In {hours}h</span>;
    }
    const days = Math.floor(hours / 24);
    return <span style={{ color: 'var(--text-muted)' }}>In {days}d {hours % 24}h</span>;
  };

  const isCancellable = (status) => {
    return !['FULFILLED', 'CANCELLED', 'UNFULFILLED'].includes(status);
  };

  const updateRequestFilter = (setter, value) => {
    setCurrentPage(1);
    setter(value);
  };

  const requestTotal = requestPagination.total ?? requests.length;
  const pageCount = Math.max(1, requestPagination.totalPages || Math.ceil(requestTotal / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const firstVisibleRequest = requestTotal ? (safePage - 1) * pageSize + 1 : 0;
  const lastVisibleRequest = Math.min(safePage * pageSize, requestTotal);
  const visibleRequests = requests;

  return (
    <div className="requests-container">
      {/* Page Header */}
      <div className="requests-hero">
        <div className="requests-hero-content">
          <span className="requests-hero-icon"><ClipboardList size={28} /></span>
          <section>
            <h1>Hospital Blood Requests &amp; Inventory Matching</h1>
            <p>Deterministic compatibility matching, FEFO stock reservation, and authoritative fulfillment tracking.</p>
          </section>
        </div>
        {canCreateRequest && (
          <button type="button" className="requests-hero-submit" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={17} /> Submit Blood Request
          </button>
        )}
        <div className="requests-hero-points">
          <span><CheckCircle2 size={14} /> Compatibility matching</span>
          <span><CheckCircle2 size={14} /> FEFO reservation</span>
          <span><CheckCircle2 size={14} /> Fulfillment tracking</span>
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

      {/* KPI Summary Cards */}
      <div className="grid-4 requests-kpis">
        {[
          { title: 'Total Requests', value: summary?.totalRequests, caption: 'Active and historical requests', icon: ClipboardList, tone: 'total' },
          { title: 'Pending Validation', value: summary?.pendingCount, caption: 'Awaiting clinical clearance', icon: CheckCircle2, tone: 'pending' },
          { title: 'Emergency Requests', value: summary?.emergencyCount, caption: 'Highest clinical priority', icon: AlertTriangle, tone: 'emergency' },
          { title: 'Due in 24 Hours', value: summary?.dueWithin24hCount, caption: 'Immediate logistics demand', icon: Clock, tone: 'due' }
        ].map(({ title, value, caption, icon: Icon, tone }) => (
          <div className={`card request-kpi ${tone}`} key={title}>
            <span className="request-kpi-icon"><Icon size={19} /></span>
            <div className="request-kpi-copy">
              <div className="request-kpi-title">{title}</div>
              <div className="request-kpi-value">{value ?? '—'}</div>
              <div className="request-kpi-caption">{caption}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="request-shortcuts">
        {[
          { title: 'Active & Historical Requests', text: 'View and manage ongoing and past blood requests.', count: summary?.totalRequests ?? '—', note: 'Total Requests', icon: Droplet, action: () => { updateRequestFilter(setStatusFilter, 'ALL'); document.getElementById('requests-table')?.scrollIntoView({ behavior: 'smooth' }); }, tone: 'active', label: 'View Requests' },
          { title: 'Pending Validation', text: 'Review and approve blood requests from hospitals.', count: summary?.pendingCount ?? '—', note: 'Awaiting Approval', icon: Timer, action: () => { updateRequestFilter(setStatusFilter, 'PENDING'); document.getElementById('requests-table')?.scrollIntoView({ behavior: 'smooth' }); }, tone: 'pending', label: 'Review Now' },
          { title: 'Emergency Requests', text: 'Immediate requests requiring urgent fulfillment.', count: summary?.emergencyCount ?? '—', note: 'Highest Priority', icon: AlertTriangle, action: () => { updateRequestFilter(setUrgencyFilter, 'EMERGENCY'); document.getElementById('requests-table')?.scrollIntoView({ behavior: 'smooth' }); }, tone: 'emergency', label: 'View Details' },
          { title: 'Due in 24 Hours', text: 'Requests that must be fulfilled within 24 hours.', count: summary?.dueWithin24hCount ?? '—', note: 'At Risk', icon: CalendarClock, action: () => { updateRequestFilter(setStatusFilter, 'ALL'); document.getElementById('requests-table')?.scrollIntoView({ behavior: 'smooth' }); }, tone: 'due', label: 'View All' }
        ].map((item) => {
          const Icon = item.icon;
          return <button type="button" className={`request-shortcut ${item.tone}`} key={item.title} onClick={item.action}>
            <span className="request-shortcut-icon"><Icon size={21} /></span>
            <span className="request-shortcut-copy"><strong>{item.title}</strong><small>{item.text}</small></span>
            <span className="request-shortcut-count"><strong>{item.count}</strong><small>{item.note}</small></span>
            <span className="request-shortcut-action">{item.label}<ArrowRight size={16} /></span>
          </button>;
        })}
      </div>

      {/* Filter and Control Bar */}
      <div className="card request-filter-panel">
        <div className="requests-filter-grid">
          <div className="requests-filter-field">
            <span className="requests-filter-label">Component</span>
            <div className="requests-segments" role="group" aria-label="Filter by component">
            {['ALL', 'RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA'].map((comp) => (
              <button
                type="button"
                key={comp}
                className={`requests-segment ${componentFilter === comp ? 'selected' : ''}`}
                aria-pressed={componentFilter === comp}
                onClick={() => updateRequestFilter(setComponentFilter, comp)}
              >
                {comp === 'ALL' ? 'All' : comp === 'RED_BLOOD_CELLS' ? 'RBC' : comp === 'PLATELETS' ? 'Platelets' : 'Plasma'}
              </button>
            ))}
            </div>
          </div>

          <div className="requests-filter-field">
            <span className="requests-filter-label">Urgency</span>
            <div className="requests-segments" role="group" aria-label="Filter by urgency">
            {['ALL', 'EMERGENCY', 'URGENT', 'ROUTINE'].map((urg) => (
              <button
                type="button"
                key={urg}
                className={`requests-segment ${urgencyFilter === urg ? 'selected' : ''} ${urg === 'EMERGENCY' ? 'emergency' : ''}`}
                aria-pressed={urgencyFilter === urg}
                onClick={() => updateRequestFilter(setUrgencyFilter, urg)}
              >
                {urg === 'ALL' ? 'All' : urg}
              </button>
            ))}
            </div>
          </div>

          <label className="requests-filter-field">
            <span className="requests-filter-label">Status</span>
            <select
              className="requests-filter-control"
              value={statusFilter}
              onChange={(e) => updateRequestFilter(setStatusFilter, e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="VALIDATED">Validated</option>
              <option value="PARTIALLY_ALLOCATED">Partially Allocated</option>
              <option value="ALLOCATED">Allocated</option>
              <option value="TRANSFER_PENDING">Transfer Pending</option>
              <option value="FULFILLED">Fulfilled</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="UNFULFILLED">Unfulfilled</option>
            </select>
          </label>

          <label className="requests-filter-field requests-search-field">
            <span className="requests-filter-label">Search requests</span>
            <input
              type="text"
              className="requests-filter-control"
              placeholder="Search clinical reason or hospital..."
              value={searchTerm}
              onChange={(e) => updateRequestFilter(setSearchTerm, e.target.value)}
            />
          </label>

          <button type="button" className="requests-refresh" onClick={fetchData} title="Refresh requests" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Blood Requests Table */}
      <div className="card request-table-card" id="requests-table">
        <div className="requests-table-heading">
          <div>
            <h2 className="card-title">Requisitions</h2>
            <p>{requestTotal} {requestTotal === 1 ? 'request' : 'requests'} match the current filters</p>
          </div>
          <label className="requests-page-size">
            <span>Rows</span>
            <select value={pageSize} onChange={(event) => updateRequestFilter(setPageSize, Number(event.target.value))} aria-label="Requests per page">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>per page</span>
          </label>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading blood requests...
          </div>
        ) : requestTotal === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ClipboardList size={32} style={{ opacity: 0.5, margin: '0 auto 0.5rem auto' }} />
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>No blood requests found</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {canCreateRequest
                ? 'Click "Submit Blood Request" above to initiate a new requisition.'
                : 'No hospital blood requests matching current filters.'}
            </p>
          </div>
        ) : (
          <div className="data-table-container requests-data-table-wrap">
            <table className="data-table requests-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Hospital</th>
                  <th>Component & Group</th>
                  <th>Quantity</th>
                  <th>Urgency</th>
                  <th>Required By</th>
                  <th>Status</th>
                  <th>Fulfillment Progress</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((req) => {
                  const percent = req.requestedQuantity > 0
                    ? Math.min(100, Math.round((req.fulfilledQuantity / req.requestedQuantity) * 100))
                    : 0;

                  return (
                    <tr key={req.id}>
                      <td>
                        <span
                          className="request-id-chip"
                          title={req.id}
                        >
                          {req.id.slice(0, 8)}
                        </span>
                      </td>

                      <td>
                        <div className="request-hospital-name">{req.hospital?.name || 'Hospital'}</div>
                        {req.reason && (
                          <div className="request-reason" title={req.reason}>
                            <MessageSquare size={11} /> {req.reason}
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="request-blood-group">
                            {req.requestedABO}{req.requestedRh === 'POSITIVE' ? '+' : '-'}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {req.requestedComponent === 'RED_BLOOD_CELLS'
                              ? 'RBC'
                              : req.requestedComponent === 'PLATELETS'
                              ? 'Platelets'
                              : 'Plasma'}
                          </span>
                        </div>
                      </td>

                      <td style={{ fontWeight: 600 }}>
                        {req.requestedQuantity} {req.requestedQuantity === 1 ? 'unit' : 'units'}
                      </td>

                      <td>{getUrgencyBadge(req.urgency)}</td>

                      <td>
                        <div className="request-deadline">{formatCountdown(req.requiredBy)}</div>
                        <div className="request-deadline-date">
                          {new Date(req.requiredBy).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>

                      <td>
                        <StatusBadge status={req.status} label={req.status.replace(/_/g, ' ')} />
                      </td>

                      <td className="request-progress-cell">
                        <div className="request-progress-label">
                          <span style={{ fontWeight: 600 }}>{req.fulfilledQuantity} / {req.requestedQuantity} units</span>
                          <span style={{ color: 'var(--text-muted)' }}>{percent}%</span>
                        </div>
                        <div className="request-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" aria-label={`${percent}% fulfilled`}>
                          <div className={`request-progress-fill ${percent === 100 ? 'complete' : percent > 0 ? 'partial' : ''}`} style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                      </td>

                      <td className="request-actions-cell">
                        <div className="request-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenDetails(req.id)}
                          >
                            Match & Details
                          </button>
                          {canCreateRequest && isCancellable(req.status) && (
                            <button
                              className="btn btn-sm"
                              style={{
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                backgroundColor: '#fef2f2'
                              }}
                              onClick={() => {
                                setSelectedRequest(req);
                                setIsCancelModalOpen(true);
                              }}
                            >
                              Cancel
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
        {!loading && requestTotal > 0 && (
          <div className="requests-pagination">
            <span className="requests-pagination-summary">Showing <strong>{firstVisibleRequest}–{lastVisibleRequest}</strong> of <strong>{requestTotal}</strong></span>
            <nav className="requests-pagination-controls" aria-label="Request pages">
              <button type="button" onClick={() => setCurrentPage(1)} disabled={safePage === 1} aria-label="First page"><ChevronsLeft size={16} /></button>
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span>Page <strong>{safePage}</strong> of <strong>{pageCount}</strong></span>
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={safePage === pageCount} aria-label="Next page"><ChevronRight size={16} /></button>
              <button type="button" onClick={() => setCurrentPage(pageCount)} disabled={safePage === pageCount} aria-label="Last page"><ChevronsRight size={16} /></button>
            </nav>
          </div>
        )}
      </div>

      {/* CREATE BLOOD REQUEST MODAL */}
      {isCreateModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '640px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title">Submit Hospital Blood Request</h2>
              <button className="btn-close" onClick={() => setIsCreateModalOpen(false)} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {formData.urgency === 'EMERGENCY' && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#fee2e2',
                      border: '1px solid #f87171',
                      borderRadius: 'var(--radius-md)',
                      color: '#991b1b',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span><strong>CLINICAL EMERGENCY REQUISITION:</strong> Priority dispatch flag activated. Ensure patient identification and crossmatch status are confirmed in clinical notes.</span>
                  </div>
                )}

                {/* Component Type & Units */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Blood Component *</label>
                    <select
                      className="form-control"
                      value={formData.requestedComponent}
                      onChange={(e) => setFormData({ ...formData, requestedComponent: e.target.value })}
                      required
                    >
                      <option value="RED_BLOOD_CELLS">Red Blood Cells (PRBC)</option>
                      <option value="PLATELETS">Platelets (Apheretic / Pooled)</option>
                      <option value="PLASMA">Fresh Frozen Plasma (FFP)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Quantity (Units) *</label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      max="50"
                      value={formData.requestedQuantity}
                      onChange={(e) => setFormData({ ...formData, requestedQuantity: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* ABO Group & Rh Factor */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">ABO Blood Group *</label>
                    <select
                      className="form-control"
                      value={formData.requestedABO}
                      onChange={(e) => setFormData({ ...formData, requestedABO: e.target.value })}
                      required
                    >
                      <option value="O">O (Universal Red Cell / Universal Plasma recipient)</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="AB">AB (Universal Plasma donor)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rh Factor *</label>
                    <select
                      className="form-control"
                      value={formData.requestedRh}
                      onChange={(e) => setFormData({ ...formData, requestedRh: e.target.value })}
                      required
                    >
                      <option value="NEGATIVE">Negative (-)</option>
                      <option value="POSITIVE">Positive (+)</option>
                    </select>
                  </div>
                </div>

                {/* Urgency & Quick Presets */}
                <div className="form-group">
                  <label className="form-label">Requisition Urgency Level *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${formData.urgency === 'ROUTINE' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => applyTimePreset(24, 'ROUTINE')}
                    >
                      Routine (24-48h)
                    </button>
                    <button
                      type="button"
                      className={`btn ${formData.urgency === 'URGENT' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => applyTimePreset(12, 'URGENT')}
                    >
                      Urgent (&lt;12h)
                    </button>
                    <button
                      type="button"
                      className={`btn ${formData.urgency === 'EMERGENCY' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => applyTimePreset(4, 'EMERGENCY')}
                      style={formData.urgency === 'EMERGENCY' ? { backgroundColor: '#b91c1c', borderColor: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.3rem' } : { display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <AlertTriangle size={13} /> Emergency (&lt;4h)
                    </button>
                  </div>
                </div>

                {/* Required By Date/Time */}
                <div className="form-group">
                  <label className="form-label">Required By (Date & Time) *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={formData.requiredBy}
                    onChange={(e) => setFormData({ ...formData, requiredBy: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Times are evaluated in UTC relative to server clock to guarantee prompt logistics coordination.
                  </div>
                </div>

                {/* Clinical Indication / Reason */}
                <div className="form-group">
                  <label className="form-label">Clinical Indication / Diagnosis / Location</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="e.g. Level 1 Trauma resuscitation in Bay 4; Scheduled CABG surgery..."
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Presets:</span>
                    {[
                      'Level 1 Trauma resuscitation',
                      'Urgent CABG cardiothoracic surgery',
                      'Postpartum hemorrhage protocol (MTP)',
                      'Oncology severe thrombocytopenia'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => applyReasonPreset(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Submitting...' : 'Confirm Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REQUEST DETAILS & INVENTORY MATCHING DRAWER / MODAL */}
      {isDetailModalOpen && selectedRequest && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '860px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 className="modal-title">
                  Requisition #{selectedRequest.id.slice(0, 8)}
                </h2>
                {getUrgencyBadge(selectedRequest.urgency)}
                <StatusBadge status={selectedRequest.status} label={selectedRequest.status.replace(/_/g, ' ')} />
              </div>
              <button
                className="btn-close"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  if (searchParams.has('view')) {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete('view');
                    setSearchParams(nextParams);
                  }
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Summary Specs Card */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Component</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary)' }}>
                    {selectedRequest.requestedComponent}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ABO / Rh Required</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {selectedRequest.requestedABO} {selectedRequest.requestedRh === 'POSITIVE' ? 'Positive (+)' : 'Negative (-)'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requested Quantity</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {selectedRequest.requestedQuantity} Units
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remaining Shortage</div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: selectedRequest.remainingQuantity > 0 ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {selectedRequest.remainingQuantity} Units
                  </div>
                </div>
              </div>

              {/* Request Metadata */}
              <div className="grid-2">
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Requesting Hospital</div>
                  <div style={{ fontWeight: 600 }}>{selectedRequest.hospital?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {selectedRequest.hospital?.address}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Required By Deadline</div>
                  <div style={{ fontWeight: 600 }}>{formatCountdown(selectedRequest.requiredBy)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(selectedRequest.requiredBy).toUTCString()}
                  </div>
                </div>
              </div>

              {selectedRequest.reason && (
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Clinical Reason / Indication</div>
                  <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.85rem' }}>
                    {selectedRequest.reason}
                  </div>
                </div>
              )}

              {/* MODULE 7: DETERMINISTIC INVENTORY MATCHING & RESERVATION ENGINE */}
              {!['FULFILLED', 'CANCELLED', 'UNFULFILLED'].includes(selectedRequest.status) && selectedRequest.remainingQuantity > 0 && (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        Inventory Compatibility & Allocation Engine
                      </h3>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Ruleset: <code style={{ backgroundColor: '#e2e8f0', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>v1.0-clinical-standard</code> • Ordered by First-Expiry-First-Out (FEFO)
                      </div>
                    </div>

                    {/* Target inventory institution selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Source Stock:</span>
                      <select
                        className="form-control"
                        value={matchingInstitutionId}
                        onChange={(e) => handleMatchingInstitutionChange(e.target.value)}
                        disabled={!isAdmin}
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', width: '220px' }}
                      >
                        {institutions.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name} ({inst.type === 'HOSPITAL' ? 'Local' : 'Blood Bank'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Matching Mode Tabs */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${activeMatchingTab === 'local' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setActiveMatchingTab('local')}
                    >
                      Facility Stock
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${activeMatchingTab === 'nearby' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setActiveMatchingTab('nearby');
                        fetchNearbyMatches(selectedRequest.id);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Truck size={14} /> Nearby Blood Banks & Transfers
                      {nearbyData?.nearbyInstitutions?.length > 0 && (
                        <span style={{ backgroundColor: '#fff', color: 'var(--color-primary)', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700 }}>
                          {nearbyData.nearbyInstitutions.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {activeMatchingTab === 'nearby' ? (
                    /* MODULE 8: NEARBY BLOOD BANK INVENTORY SEARCH & TRANSFERS */
                    <div>
                      <div
                        style={{
                          padding: '0.65rem 0.85rem',
                          backgroundColor: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          color: '#1e40af',
                          marginBottom: '0.85rem'
                        }}
                      >
                        <strong>Distance Disclaimer:</strong> {nearbyData?.disclaimer || 'Haversine distance is approximate straight-line geographic distance only and does not reflect driving distance, road transit conditions, or guaranteed delivery ETA.'}
                      </div>

                      {nearbyLoading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          Searching participating blood banks and calculating Haversine distances...
                        </div>
                      ) : !nearbyData || nearbyData.nearbyInstitutions.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                          <MapPin size={24} style={{ opacity: 0.5, margin: '0 auto 0.35rem auto' }} />
                          <div style={{ fontWeight: 600 }}>No nearby blood banks with matching stock found</div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Currently no other participating facilities hold eligible unreserved {selectedRequest.requestedComponent} units matching this profile.
                          </p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          {nearbyData.nearbyInstitutions.map((item) => (
                            <div
                              key={item.institution.id}
                              style={{
                                backgroundColor: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{item.institution.name}</h4>
                                    <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                                      {item.institution.type === 'BLOOD_BANK' ? 'Blood Bank' : 'Hospital'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {item.institution.address}
                                  </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                    ~{item.distanceKm ?? '?'} km
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {item.availableCompatibleCount} compatible unit(s)
                                  </div>
                                </div>
                              </div>

                              {/* Candidate Units from this institution */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0' }}>
                                {item.candidateUnits.map((u) => (
                                  <div
                                    key={u.id}
                                    style={{
                                      padding: '0.35rem 0.6rem',
                                      backgroundColor: 'var(--bg-subtle)',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem'
                                    }}
                                  >
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.unitCode}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                                      {u.aboGroup}{u.rhFactor === 'POSITIVE' ? '+' : '-'}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)' }}>({u.daysUntilExpiry}d left)</span>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={actionLoading}
                                  onClick={() => handleRequestTransfer(item.institution.id, item.candidateUnits.map((u) => u.id))}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                  <Truck size={14} /> Request Transfer ({Math.min(selectedRequest.remainingQuantity, item.candidateUnits.length)} Units)
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : !matchesData || matchesData.candidateUnits.length === 0 ? (
                    <div
                      style={{
                        padding: '1.5rem',
                        textAlign: 'center',
                        backgroundColor: '#fff',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <AlertCircle size={24} style={{ color: '#b91c1c', opacity: 0.8, margin: '0 auto 0.35rem auto' }} />
                      <div style={{ fontWeight: 600, color: '#b91c1c' }}>
                        No eligible compatible units found in {matchesData?.targetInstitution?.name || 'selected inventory'}.
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Remaining shortage of {selectedRequest.remainingQuantity} units. Use Nearby Search to coordinate inter-institution transfers.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* Shortage indicator */}
                      <div
                        style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: matchesData.isSufficient ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${matchesData.isSufficient ? '#bbf7d0' : '#fde68a'}`,
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.85rem',
                          marginBottom: '0.75rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <strong>{matchesData.isSufficient ? 'Sufficient Stock Available:' : 'Partial Inventory Shortage:'}</strong>{' '}
                          Found {matchesData.candidateUnits.length} eligible unit(s) in {matchesData.targetInstitution?.name}.
                          {matchesData.shortage > 0 && ` Remaining shortage of ${matchesData.shortage} units.`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Selected: {selectedUnitIds.length} / {selectedRequest.remainingQuantity}
                        </div>
                      </div>

                      {/* Candidate Units Table */}
                      <div className="data-table-container" style={{ backgroundColor: '#fff', maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}>Select</th>
                              <th>Unit Code (ISBT-128)</th>
                              <th>Component & Group</th>
                              <th>Expiry (FEFO)</th>
                              <th>Compatibility</th>
                              <th>Volume</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchesData.candidateUnits.map((candidate) => {
                              const isChecked = selectedUnitIds.includes(candidate.id);

                              return (
                                <tr key={candidate.id} style={{ backgroundColor: isChecked ? '#eff6ff' : 'transparent' }}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleSelectUnit(candidate.id)}
                                      disabled={!isChecked && selectedUnitIds.length >= selectedRequest.remainingQuantity}
                                    />
                                  </td>
                                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                    {candidate.unitCode}
                                  </td>
                                  <td>
                                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                                      {candidate.aboGroup}{candidate.rhFactor === 'POSITIVE' ? '+' : '-'}
                                    </span>{' '}
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      {candidate.componentType}
                                    </span>
                                  </td>
                                  <td>
                                    <div>{new Date(candidate.expiryDate).toLocaleDateString()}</div>
                                    <div style={{ fontSize: '0.75rem', color: candidate.daysUntilExpiry <= 5 ? '#b91c1c' : 'var(--text-muted)', fontWeight: candidate.daysUntilExpiry <= 5 ? 700 : 500 }}>
                                      {candidate.daysUntilExpiry} days left
                                    </div>
                                  </td>
                                  <td>
                                    {candidate.isIdentical ? (
                                      <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                                        Identical Match
                                      </span>
                                    ) : (
                                      <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                                        Compatible Alt
                                      </span>
                                    )}
                                  </td>
                                  <td>{candidate.volumeMl} mL</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Allocation Confirmation Action Bar */}
                      {canAllocate && (
                        <div
                          style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem',
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            gap: '0.75rem',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Optional allocation justification / verification note..."
                            value={allocationNotes}
                            onChange={(e) => setAllocationNotes(e.target.value)}
                            style={{ flex: 1, fontSize: '0.85rem' }}
                          />

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleAllocateTopFEFO}
                              disabled={actionLoading}
                              title="Automatically allocate the oldest eligible matching units"
                            >
                              Allocate Top FEFO ({Math.min(selectedRequest.remainingQuantity, matchesData.candidateUnits.length)})
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={handleAllocateSelected}
                              disabled={actionLoading || selectedUnitIds.length === 0}
                            >
                              Confirm Selected ({selectedUnitIds.length})
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Authoritative Allocations Table */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Authoritative Allocated Physical Units ({selectedRequest.allocations?.length || 0})
                </div>

                {!selectedRequest.allocations || selectedRequest.allocations.length === 0 ? (
                  <div
                    style={{
                      padding: '1.5rem',
                      textAlign: 'center',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem'
                    }}
                  >
                    No physical blood units allocated yet.
                    <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                      Select compatible units in the Matching Engine above and confirm allocation.
                    </div>
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Unit Code (ISBT-128)</th>
                          <th>Component & ABO/Rh</th>
                          <th>Expiry (FEFO)</th>
                          <th>Allocated By</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.allocations.map((alloc) => (
                          <tr key={alloc.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {alloc.bloodUnit?.unitCode || 'Unit'}
                            </td>
                            <td>
                              {alloc.bloodUnit?.aboGroup}
                              {alloc.bloodUnit?.rhFactor === 'POSITIVE' ? '+' : '-'} {alloc.bloodUnit?.componentType}
                            </td>
                            <td>{new Date(alloc.bloodUnit?.expiryDate).toLocaleDateString()}</td>
                            <td>{alloc.allocatedBy?.name || 'Staff'}</td>
                            <td><StatusBadge status={alloc.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                {/* Staff Actions */}
                {(isBloodBankStaff || isAdmin) && selectedRequest.status === 'PENDING' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsValidateModalOpen(true)}
                  >
                    Validate Requisition
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {canCreateRequest && isCancellable(selectedRequest.status) && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ color: '#b91c1c', border: '1px solid #fecaca', backgroundColor: '#fef2f2' }}
                    onClick={() => setIsCancelModalOpen(true)}
                  >
                    Cancel Requisition
                  </button>
                )}
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
        </div>
      )}

      {/* CANCEL REQUEST CONFIRMATION MODAL */}
      {isCancelModalOpen && selectedRequest && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#b91c1c' }}>
                Cancel Blood Requisition #{selectedRequest.id.slice(0, 8)}
              </h2>
              <button className="btn-close" onClick={() => setIsCancelModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleCancelRequest}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Are you sure you want to cancel this requisition? Any currently reserved units will be automatically released back to available inventory in an atomic transaction.
                </p>

                <div className="form-group">
                  <label className="form-label">Cancellation Reason</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Procedure rescheduled, clinical indication resolved"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCancelModalOpen(false)}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#b91c1c', borderColor: '#991b1b' }}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VALIDATE REQUEST MODAL */}
      {isValidateModalOpen && selectedRequest && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                Validate Requisition #{selectedRequest.id.slice(0, 8)}
              </h2>
              <button className="btn-close" onClick={() => setIsValidateModalOpen(false)}>×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Confirm that this requisition meets clinical criteria and is cleared for deterministic inventory matching and allocation.
              </p>

              <div className="form-group">
                <label className="form-label">Clinical Verification Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Verified by Central Blood Bank crossmatch lab"
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsValidateModalOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleValidateRequest}
                disabled={actionLoading}
              >
                {actionLoading ? 'Validating...' : 'Confirm Validation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestsPage;
