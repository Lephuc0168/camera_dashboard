import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { IdentityThreshold } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Sliders, ShieldCheck, AlertCircle } from 'lucide-react';

export const ThresholdsPage: React.FC = () => {
  const [thresholds, setThresholds] = useState<IdentityThreshold[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThresholds = async () => {
    try {
      const response = await api.get('/thresholds');
      setThresholds(response.data);
    } catch (err) {
      console.error('Failed to fetch thresholds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Identity-wise EVT Threshold Audit</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          Generalized Pareto Distribution (GPD) fits, exceedance parameters, and global EVT fallback status per identity
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Sliders size={20} color="var(--primary)" />
            <span>Enrolled Identity Threshold Table</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            Total Configured Entries: {thresholds.length}
          </span>
        </div>

        <table className="custom-table">
          <thead>
            <tr>
              <th>Identity Name</th>
              <th>Threshold Type</th>
              <th>Threshold Value</th>
              <th>Fit Status</th>
              <th>Impostor Scores</th>
              <th>Exceedances</th>
              <th>Fallback Used</th>
              <th>Model Version</th>
            </tr>
          </thead>
          <tbody>
            {thresholds.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  No threshold entries loaded in database.
                </td>
              </tr>
            ) : (
              thresholds.map((t) => (
                <tr key={t.threshold_id}>
                  <td style={{ fontWeight: 600 }}>{t.identity_name || 'Global EVT Baseline'}</td>
                  <td>
                    <StatusBadge type={t.threshold_type} />
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {t.threshold_value.toFixed(3)}
                  </td>
                  <td>
                    <StatusBadge type={t.fit_status as any} />
                  </td>
                  <td>{t.n_impostor_scores ?? 'N/A'}</td>
                  <td>{t.n_exceedances ?? 'N/A'}</td>
                  <td>
                    {t.fallback_used ? (
                      <span style={{ color: 'var(--accent-amber)', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={14} /> YES
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-green)', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={14} /> NO
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{t.model_version}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
