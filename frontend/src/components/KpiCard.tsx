import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  color?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtext, icon: Icon, color = '#6366f1' }) => {
  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: `rgba(${hexToRgb(color)}, 0.15)`,
        border: `1px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', margin: '2px 0' }}>{value}</div>
        {subtext && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{subtext}</div>}
      </div>
    </div>
  );
};

function hexToRgb(hex: string) {
  try {
    if (!hex || !hex.startsWith('#')) return '99, 102, 241';
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return '99, 102, 241';
    const bigint = parseInt(cleanHex, 16);
    if (isNaN(bigint)) return '99, 102, 241';
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  } catch {
    return '99, 102, 241';
  }
}
