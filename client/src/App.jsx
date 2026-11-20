import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/common/Header';
import Sidebar, { isDeveloperUser } from './components/common/Sidebar';
import DevToolsModal from './components/common/DevToolsModal';
import useWebSocket from './hooks/useWebSocket';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import HomePage from './pages/HomePage';
import HealthCheckPage from './pages/HealthCheckPage';
import InstitutionsPage from './pages/InstitutionsPage';
import InventoryPage from './pages/InventoryPage';
import RequestsPage from './pages/RequestsPage';
import TransfersPage from './pages/TransfersPage';
import ExpiryMonitoringPage from './pages/ExpiryMonitoringPage';
import DemandForecastPage from './pages/DemandForecastPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import NotFoundPage from './pages/NotFoundPage';

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  const handleWsEvent = useCallback((event) => {
    window.dispatchEvent(new CustomEvent('hemosync:live-update', { detail: event }));
  }, []);

  const { connected: wsConnected } = useWebSocket(handleWsEvent);

  if (loading) {
    return (
      <div className="auth-loader-screen">
        <div className="auth-loader-spinner" />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Authenticating secure session...
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="*"
          element={<Navigate to="/login" replace state={{ from: { pathname: location.pathname } }} />}
        />
      </Routes>
    );
  }

  const isDev = isDeveloperUser(user);

  return (
    <div className="app-container">
      <Sidebar
        wsConnected={wsConnected}
        onOpenDevTools={() => isDev && setDevToolsOpen(true)}
      />

      <div className="main-layout">
        <Header onOpenDevTools={() => isDev && setDevToolsOpen(true)} />

        <main className="content-wrapper">
          <Routes>
            <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/institutions" element={<ProtectedRoute><InstitutionsPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute><RequestsPage /></ProtectedRoute>} />
            <Route path="/transfers" element={<ProtectedRoute><TransfersPage /></ProtectedRoute>} />
            <Route path="/expiry" element={<ProtectedRoute><ExpiryMonitoringPage /></ProtectedRoute>} />
            <Route path="/forecasts" element={<ProtectedRoute><DemandForecastPage /></ProtectedRoute>} />
            <Route path="/forecast" element={<ProtectedRoute><DemandForecastPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute><AuditLogsPage /></ProtectedRoute>} />
            <Route
              path="/admin/users"
              element={<ProtectedRoute allowedRoles={['PLATFORM_ADMIN']}><AdminUsersPage /></ProtectedRoute>}
            />
            <Route
              path="/dev"
              element={isDev ? <HealthCheckPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/health"
              element={isDev ? <HealthCheckPage /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
      {isDev && (
        <DevToolsModal
          isOpen={devToolsOpen}
          onClose={() => setDevToolsOpen(false)}
          wsConnected={wsConnected}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
