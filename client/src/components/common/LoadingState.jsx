import React from 'react';

export function LoadingState({ message = 'Loading...', minHeight = '180px' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: '2rem',
        color: 'var(--text-muted)'
      }}
    >
      <div
        className="clinical-spinner"
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--border-subtle)',
          borderTop: '3px solid var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }}
      />
      <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{message}</span>
    </div>
  );
}

export default LoadingState;
