import React, { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, AlertCircle, X, Users } from 'lucide-react';
import apiClient from '../services/api';
import StatusBadge from '../components/common/StatusBadge';

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New User Form State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'HOSPITAL_STAFF',
    institutionId: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, institutionsResult] = await Promise.allSettled([
        apiClient.getAdminUsers(),
        apiClient.getInstitutions({ limit: 100 })
      ]);

      if (usersResult.status === 'rejected') {
        throw usersResult.reason;
      }

      const usersList = usersResult.value.data || [];
      setUsers(usersList);
      setInstitutions(
        institutionsResult.status === 'fulfilled'
          ? (institutionsResult.value.data?.institutions || institutionsResult.value.data || [])
          : []
      );
    } catch (err) {
      setError(err.message || 'Failed to load user directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        institutionId: formData.role === 'PLATFORM_ADMIN' ? null : (formData.institutionId || null)
      };

      await apiClient.createAdminUser(payload);
      setShowModal(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'HOSPITAL_STAFF',
        institutionId: ''
      });
      await fetchUsers();
    } catch (err) {
      setFormError(err.message || 'Failed to create user account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Staff & User Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Platform Admin Access — Provision and audit hospital and blood bank staff credentials.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <UserPlus size={15} /> Add Staff Account
        </button>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Creation Modal / Dialog */}
      {showModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '480px', margin: '1rem' }}>
            <div className="card-header">
              <h2 className="card-title">Provision New Staff Account</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-text)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertCircle size={16} /> {formError}
              </div>
            )}

            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">Full Name & Title</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Dr. Jennifer Hayes"
                  className="form-input"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Work Email Address</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="jennifer.hayes@metrohealth.org"
                  className="form-input"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Initial Password (min 8 chars)</label>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  className="form-input"
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">System Role</label>
                <select
                  name="role"
                  className="form-input"
                  value={formData.role}
                  onChange={handleInputChange}
                >
                  <option value="HOSPITAL_STAFF">HOSPITAL_STAFF (Clinical / Transfusion)</option>
                  <option value="BLOOD_BANK_STAFF">BLOOD_BANK_STAFF (Laboratory / Logistics)</option>
                  <option value="PLATFORM_ADMIN">PLATFORM_ADMIN (System Administrator)</option>
                </select>
              </div>

              {formData.role !== 'PLATFORM_ADMIN' && (
                <div className="form-group">
                  <label className="form-label">Associated Institution</label>
                  <select
                    name="institutionId"
                    className="form-input"
                    required
                    value={formData.institutionId}
                    onChange={handleInputChange}
                  >
                    <option value="">-- Select Institution --</option>
                    {institutions.map(inst => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} ({inst.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  {submitting ? 'Creating...' : 'Confirm Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Registered System Users ({users.length})</h2>
          <button onClick={fetchUsers} disabled={loading} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading user directory...</p>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No users found.</p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name & Contact</th>
                  <th>System Role</th>
                  <th>Institution Assignment</th>
                  <th>Account Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      <StatusBadge status={u.role === 'PLATFORM_ADMIN' ? 'warning' : 'info'} label={u.role} />
                    </td>
                    <td>
                      {u.institution ? (
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.institution.name}</div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {u.institution.type} • {u.institution.verificationStatus}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>Platform Wide</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={u.isActive ? 'healthy' : 'danger'} label={u.isActive ? 'Active' : 'Disabled'} />
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUsersPage;
