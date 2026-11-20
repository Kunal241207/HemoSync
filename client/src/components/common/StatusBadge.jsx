import React from 'react';

export function StatusBadge({ status, label }) {
  const normalized = (status || '').toLowerCase();

  let type = 'info';
  if (['healthy', 'available', 'approved', 'fulfilled', 'verified', 'active', 'passed', 'released'].includes(normalized)) {
    type = 'success';
  } else if (['degraded', 'pending', 'reserved', 'in_transfer', 'warning', 'partially_allocated', 'urgent'].includes(normalized)) {
    type = 'warning';
  } else if (['expired', 'discarded', 'rejected', 'failed', 'cancelled', 'unfulfilled', 'error', 'quarantined', 'emergency'].includes(normalized)) {
    type = 'danger';
  } else if (['validated', 'allocated', 'routine'].includes(normalized)) {
    type = 'info';
  }

  return (
    <span className={`badge badge-${type}`}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      <span>{label || status}</span>
    </span>
  );
}

export default StatusBadge;
