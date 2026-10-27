import React, { useState, useEffect } from 'react';
import apiClient from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

export function InstitutionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';

  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [referenceOrigin, setReferenceOrigin] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInst, setEditingInst] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    type: 'HOSPITAL',
    address: '',
    latitude: 42.3601,
    longitude: -71.0589,
    licenseNumber: '',
    phone: '',
    email: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchInstitutions = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.verificationStatus = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      if (referenceOrigin) {
        const [lat, lng] = referenceOrigin.split(',');
        params.nearLat = lat;
        params.nearLng = lng;
      }

      const res = await apiClient.getInstitutions(params);
      setInstitutions(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch participating institutions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstitutions();
  }, [typeFilter, statusFilter, referenceOrigin]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchInstitutions();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'latitude' || name === 'longitude' ? parseFloat(value) || 0 : value
    }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      await apiClient.createInstitution(formData);
      setShowCreateModal(false);
      setFormData({
        name: '',
        type: 'HOSPITAL',
        address: '',
        latitude: 42.3601,
        longitude: -71.0589,
        licenseNumber: '',
        phone: '',
        email: ''
      });
      await fetchInstitutions();
    } catch (err) {
      setFormError(err.message || 'Failed to register institution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (inst) => {
    setEditingInst(inst);
    setFormData({
      name: inst.name,
      type: inst.type,
      address: inst.address,
      latitude: inst.latitude,
      longitude: inst.longitude,
      licenseNumber: inst.licenseNumber,
      phone: inst.phone || '',
      email: inst.email || ''
    });
    setFormError('');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      await apiClient.updateInstitution(editingInst.id, formData);
      setShowEditModal(false);
      setEditingInst(null);
      await fetchInstitutions();
    } catch (err) {
      setFormError(err.message || 'Failed to update institution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (inst, newStatus) => {
    try {
      await apiClient.updateInstitutionStatus(inst.id, { verificationStatus: newStatus });
      await fetchInstitutions();
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleActiveToggle = async (inst) => {
    try {
      await apiClient.updateInstitutionStatus(inst.id, { isActive: !inst.isActive });
      await fetchInstitutions();
    } catch (err) {
      alert(`Error updating active state: ${err.message}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Participating Institutions & Network Directory
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Registered hospitals and licensed blood banks with Haversine geolocation ranking.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            + Register Institution
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filter and Haversine Search Bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Search Query</label>
            <input
              type="text"
              className="form-input"
              placeholder="Name, address, or license..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Institution Type</label>
            <select
              className="form-input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="HOSPITAL">Hospitals Only</option>
              <option value="BLOOD_BANK">Blood Banks Only</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Verification Status</label>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="VERIFIED">Verified</option>
              <option value="PENDING">Pending Verification</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📍 Distance Relative To</label>
            <select
              className="form-input"
              value={referenceOrigin}
              onChange={(e) => setReferenceOrigin(e.target.value)}
            >
              <option value="">None (Alphabetical)</option>
              <option value="42.3629,-71.0694">Metro General Hospital (Boston)</option>
              <option value="42.3361,-71.1065">St. Jude Medical Pavilion (Longwood)</option>
              <option value="42.2348,-71.1719">Central Regional Blood Center (Dedham)</option>
              <option value="42.3614,-71.0965">LifeStream Community Blood Bank (Cambridge)</option>
            </select>
          </div>

          <button type="submit" className="btn btn-secondary" style={{ height: '38px' }}>
            Filter Results
          </button>
        </form>
      </div>

      {/* Directory Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Institutions Directory ({institutions.length})</h2>
          <button onClick={fetchInstitutions} disabled={loading} className="btn btn-secondary btn-sm">
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading directory data...</p>
        ) : institutions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No institutions found matching criteria.</p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Institution Name & License</th>
                  <th>Type</th>
                  <th>Address & Coordinates</th>
                  {referenceOrigin && <th>Distance (Haversine)</th>}
                  <th>Verification</th>
                  <th>Active</th>
                  {isAdmin && <th>Admin Actions</th>}
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => (
                  <tr key={inst.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inst.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        License: <span className="code-inline">{inst.licenseNumber}</span>
                      </div>
                      {inst.phone && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>
                          ☎️ {inst.phone}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        status={inst.type === 'HOSPITAL' ? 'info' : 'warning'}
                        label={inst.type === 'HOSPITAL' ? '🏥 Hospital' : '🧪 Blood Bank'}
                      />
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{inst.address}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>
                        🌐 {inst.latitude.toFixed(4)}, {inst.longitude.toFixed(4)}
                      </div>
                    </td>
                    {referenceOrigin && (
                      <td>
                        <span className="badge badge-info" style={{ fontWeight: 700 }}>
                          📏 {inst.distanceKm !== null ? `${inst.distanceKm} km` : 'N/A'}
                        </span>
                      </td>
                    )}
                    <td>
                      <StatusBadge
                        status={inst.verificationStatus === 'VERIFIED' ? 'healthy' : 'warning'}
                        label={inst.verificationStatus}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={inst.isActive ? 'healthy' : 'danger'}
                        label={inst.isActive ? 'Active' : 'Disabled'}
                      />
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleEditClick(inst)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          >
                            Edit
                          </button>
                          {inst.verificationStatus !== 'VERIFIED' ? (
                            <button
                              onClick={() => handleStatusToggle(inst, 'VERIFIED')}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: '#15803d' }}
                            >
                              Verify
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusToggle(inst, 'SUSPENDED')}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#b91c1c' }}
                            >
                              Suspend
                            </button>
                          )}
                          <button
                            onClick={() => handleActiveToggle(inst)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          >
                            {inst.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register / Edit Modal */}
      {(showCreateModal || showEditModal) && (
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
              <h2 className="card-title">
                {showCreateModal ? 'Register Participating Institution' : `Edit: ${editingInst?.name}`}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-text)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: '1rem'
              }}>
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={showCreateModal ? handleCreateSubmit : handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Institution Official Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Cambridge Health Hospital"
                  className="form-input"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Institution Type</label>
                  <select
                    name="type"
                    className="form-input"
                    value={formData.type}
                    onChange={handleInputChange}
                  >
                    <option value="HOSPITAL">HOSPITAL</option>
                    <option value="BLOOD_BANK">BLOOD_BANK</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">License Number</label>
                  <input
                    name="licenseNumber"
                    type="text"
                    required
                    placeholder="e.g. HOSP-MA-2024-009"
                    className="form-input"
                    value={formData.licenseNumber}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Physical Address</label>
                <input
                  name="address"
                  type="text"
                  required
                  placeholder="Street, City, State ZIP"
                  className="form-input"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Latitude</label>
                  <input
                    name="latitude"
                    type="number"
                    step="0.0001"
                    required
                    className="form-input"
                    value={formData.latitude}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude</label>
                  <input
                    name="longitude"
                    type="number"
                    step="0.0001"
                    required
                    className="form-input"
                    value={formData.longitude}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    name="phone"
                    type="text"
                    placeholder="+1-617-555-0100"
                    className="form-input"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Official Contact Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="intake@hospital.org"
                    className="form-input"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
                  className="btn btn-secondary btn-sm"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : showCreateModal ? 'Register Institution' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InstitutionsPage;

