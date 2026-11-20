import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/api';
import { isDeveloperUser } from './Sidebar';
import { Plus, Bell, LogOut, Terminal, ChevronDown } from 'lucide-react';

export function Header({ onOpenDevTools }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const isDev = isDeveloperUser(user);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await apiClient.getNotifications({ unreadOnly: 'true', limit: 1 });
        if (res && res.data && typeof res.data.unreadCount === 'number') {
          setUnreadCount(res.data.unreadCount);
        }
      } catch (e) {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.name ? user.name.split(' ')[0] : 'Operator';
  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <header className="top-header">
      <div className="header-brand">
        <h1>{user ? `${greeting}, ${displayName}` : 'HemoSync Operations'}</h1>
        <p>Here's what's happening with your blood bank today.</p>
      </div>

      <div className="header-actions">
        {user ? (
          <>
            {location.pathname === '/inventory' ? (
              <button type="button" className="btn btn-accent btn-sm" onClick={() => window.dispatchEvent(new Event('hemosync:register-unit'))}>
                <Plus size={14} /><span>Register Physical Unit</span>
              </button>
            ) : location.pathname !== '/requests' ? (
              <Link to="/requests" className="btn btn-accent btn-sm"><Plus size={14} /><span>New Request</span></Link>
            ) : null}
            <Link
              to="/notifications"
              className="btn btn-secondary btn-sm icon-only-btn dashboard-notifications"
              title="Notifications"
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="notification-bubble">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>

            {isDev && (
              <button
                onClick={onOpenDevTools}
                className="btn btn-secondary btn-sm"
                title="Developer Diagnostic Tools"
                style={{ color: '#2d6a4f', borderColor: '#a3d9a5' }}
              >
                <Terminal size={14} />
                <span>Dev</span>
              </button>
            )}

            <div className="operator-profile" title={`${user.role} • ${user.institution?.name || 'System'}`}>
              <div className="operator-avatar">{userInitial}</div>
              <div className="operator-profile-copy">
                <span className="operator-name">{user.name}</span>
                <span className="operator-org">{user.institution?.name || 'HemoSync Platform'}</span>
              </div>
              <ChevronDown size={16} className="operator-chevron" />
            </div>

            <button
              onClick={handleSignOut}
              className="btn btn-secondary btn-sm icon-only-btn header-signout"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm">
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}

export default Header;
