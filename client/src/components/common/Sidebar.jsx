import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import heartbeatDropLogo from '../../../assets/Heartbeat Drop Logo.png';
import {
  LayoutDashboard,
  FlaskConical,
  ClipboardList,
  ArrowLeftRight,
  Building2,
  AlertTriangle,
  TrendingUp,
  History,
  Users,
  Terminal,
} from 'lucide-react';

export function isDeveloperUser(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase();
  return email.endsWith('.hemo@dev.com') || email.endsWith('@dev.com');
}

export function Sidebar({ wsConnected, onOpenDevTools }) {
  const { user } = useAuth();
  const isDev = isDeveloperUser(user);

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/inventory', label: 'Inventory', icon: FlaskConical },
    { to: '/requests', label: 'Requests', icon: ClipboardList },
    { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
    { to: '/institutions', label: 'Banks & Hospitals', icon: Building2 },
    { to: '/expiry', label: 'Expiry Alerts', icon: AlertTriangle },
    { to: '/forecasts', label: 'Demand Forecast', icon: TrendingUp },
    { to: '/audit-logs', label: 'Audit Trail', icon: History },
  ];

  if (user?.role === 'PLATFORM_ADMIN') {
    navItems.push({ to: '/admin/users', label: 'Staff Admin', icon: Users });
  }

  return (
    <aside className="app-sidebar">
      <div className="brand-mark">
        <img src={heartbeatDropLogo} alt="" />
        <strong>HemoSync</strong>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <Icon size={16} />
                <span>{item.label}</span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator">
          <span className={`status-dot ${wsConnected ? '' : 'disconnected'}`} />
          <span>{wsConnected ? 'Live • ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Connecting...'}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
          {isDev && (
            <button
              onClick={onOpenDevTools}
              className="dev-pill-button"
              title="Developer Diagnostics Console"
            >
              <Terminal size={11} />
              <span>Dev Console</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
