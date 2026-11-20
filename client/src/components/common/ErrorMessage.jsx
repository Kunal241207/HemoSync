import React from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export function ErrorMessage({
  title = 'An error occurred',
  message,
  variant = 'danger', // 'danger' | 'warning' | 'info'
  onRetry = null,
  onDismiss = null
}) {
  if (!message) return null;

  const styles = {
    danger: {
      bg: 'var(--status-danger-bg)',
      border: 'var(--status-danger-border)',
      color: 'var(--status-danger-text)',
      icon: <AlertCircle size={18} style={{ color: 'var(--status-danger-text)', flexShrink: 0, marginTop: '2px' }} />
    },
    warning: {
      bg: 'var(--status-warning-bg)',
      border: 'var(--status-warning-border)',
      color: 'var(--status-warning-text)',
      icon: <AlertTriangle size={18} style={{ color: 'var(--status-warning-text)', flexShrink: 0, marginTop: '2px' }} />
    },
    info: {
      bg: 'var(--status-info-bg)',
      border: 'var(--status-info-border)',
      color: 'var(--status-info-text)',
      icon: <Info size={18} style={{ color: 'var(--status-info-text)', flexShrink: 0, marginTop: '2px' }} />
    }
  }[variant] || styles.danger;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.85rem 1.1rem',
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 'var(--radius-md)',
        marginBottom: '1.25rem',
        fontSize: '0.875rem'
      }}
    >
      {styles.icon}
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontWeight: 600, color: styles.color, marginBottom: '0.2rem' }}>
            {title}
          </div>
        )}
        <div style={{ color: styles.color, opacity: 0.95 }}>{message}</div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: 'center', borderColor: styles.border }}
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: styles.color,
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
