import React, { useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import useWebSocket from './hooks/useWebSocket';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import NotFoundPage from './pages/NotFoundPage';

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  // Keep protected routes from being rendered anonymously and preserve the
  // requested path for navigation after login.
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

  return (
    <div className="app-container">
      <Sidebar
        wsConnected={wsConnected}
      />

      <div className="main-layout">
        <Header />

        <main className="content-wrapper">
          <Routes>
            <Route path="/" element={<NotFoundPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
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
