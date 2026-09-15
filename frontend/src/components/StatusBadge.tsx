import React from 'react';

interface StatusBadgeProps {
  type?: 'known' | 'unknown' | 'abstain' | 'identity_gpd' | 'global_evt' | 'fixed' | 'valid' | 'warning' | 'failed' | 'fallback' | string;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type = 'fixed', label }) => {
  const safeType = (type || 'fixed').toLowerCase();
  const text = label || safeType.toUpperCase();
  let className = 'badge ';

  switch (safeType) {
    case 'known':
    case 'valid':
      className += 'badge-known';
      break;
    case 'unknown':
    case 'failed':
      className += 'badge-unknown';
      break;
    case 'abstain':
    case 'warning':
    case 'fallback':
      className += 'badge-abstain';
      break;
    case 'identity_gpd':
      className += 'badge-gpd';
      break;
    case 'global_evt':
      className += 'badge-evt';
      break;
    case 'fixed':
    default:
      className += 'badge-fixed';
  }

  return <span className={className}>{text}</span>;
};
