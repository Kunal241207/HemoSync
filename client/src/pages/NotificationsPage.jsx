import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Inbox, AlertTriangle, Truck, ClipboardList, Info, Check, RefreshCw } from 'lucide-react';
import { apiClient } from '../services/api';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [unreadOnly, setUnreadOnly] = useState('false');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setActionError(null);
      const res = await apiClient.getNotifications({
        page,
        limit: 20,
        unreadOnly
      });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      setActionError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setActionError(err.message || 'Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setActionSuccess('All notifications marked as read.');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      setActionError(err.message || 'Failed to mark all as read');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'EMERGENCY':
      case 'EXPIRY':
        return <AlertTriangle size={18} style={{ color: 'var(--status-danger-text)' }} />;
      case 'TRANSFER':
        return <Truck size={18} style={{ color: 'var(--brand-forest)' }} />;
      case 'REQUEST':
        return <ClipboardList size={18} style={{ color: 'var(--brand-forest)' }} />;
      default:
        return <Info size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header notification-page-header">
        <div>
          <p className="notification-eyebrow">OPERATIONS / ACTIVITY</p>
          <h1 className="page-title notification-page-title">
            <span className="notification-title-icon"><Bell size={20} /></span>
            Notification Center
            {unreadCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--status-danger-text)',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}
              >
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="page-subtitle">
            Operational alerts, requests, transfers, allocations, and system safety dispatches.
          </p>
        </div>

        <div className="notification-controls">
          <select
            value={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.value)}
            className="form-input notification-filter"
          >
            <option value="false">All Notifications</option>
            <option value="true">Unread Only</option>
          </select>

          <button
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className="btn btn-secondary btn-sm notification-mark-all"
          >
            <CheckCheck size={14} />
            Mark All Read
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="card" style={{ backgroundColor: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)', color: 'var(--status-success-text)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <Check size={16} /> {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="card" style={{ backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger-border)', color: 'var(--status-danger-text)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <AlertTriangle size={16} /> {actionError}
        </div>
      )}

      <div className="card notification-panel">
        {loading ? (
          <div className="notification-empty">
            <div className="notification-loading-copy">
              <RefreshCw size={16} className="spin" />
              Loading notifications...
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty">
            <span className="notification-empty-icon"><Inbox size={25} /></span>
            <p className="notification-empty-title">Inbox is clear</p>
            <p className="notification-empty-copy">No operational notifications found.</p>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((notif) => {
              const isUnread = !notif.readAt;
              return (
                <div
                  key={notif.id}
                  className={`notification-item ${isUnread ? 'unread' : ''}`}
                >
                  <div className="notification-item-main">
                    <div className={`notification-item-icon type-${notif.type.toLowerCase()}`}>
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div>
                      <div className="notification-item-heading">
                        <span className="notification-item-title">
                          {notif.title}
                        </span>
                        <span
                          className="badge notification-type"
                        >
                          {notif.type}
                        </span>
                      </div>
                      <p className="notification-item-message">
                        {notif.message}
                      </p>
                      <div className="notification-item-time">
                        {new Date(notif.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="notification-item-action">
                    {isUnread && (
                      <button
                        onClick={() => handleMarkAsRead(notif.id)}
                        className="btn btn-secondary btn-sm notification-read-button"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default NotificationsPage;
