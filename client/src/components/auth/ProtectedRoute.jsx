import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⌛</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verifying authenticated session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login preserving intended target path
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Authenticated, but lacking sufficient role privileges
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

export default ProtectedRoute;
