import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
        404
      </h1>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Page Not Found
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        The requested HemoSync resource or dashboard route does not exist.
      </p>
      <Link to="/" className="btn btn-secondary btn-sm">
        Return to Overview
      </Link>
    </div>
  );
}

export default NotFoundPage;

