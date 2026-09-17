import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { IdentityThreshold } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Sliders, ShieldCheck, AlertCircle, Upload, RefreshCw, CheckCircle2 } from 'lucide-react';

export const ThresholdsPage: React.FC = () => {
  const [thresholds, setThresholds] = useState<IdentityThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = 
    (localStorage.getItem('user_role') === 'admin') || 
    ((localStorage.getItem('username') || '').toLowerCase() === 'admin');

  const fetchThresholds = async () => {
    try {
      setLoading(true);
      const response = await api.get('/thresholds');
      setThresholds(response.data);
    } catch (err: any) {
      console.error('Failed to fetch thresholds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const JETSON_UPDATE_CMD = "git clone https://github.com/Lephuc0168/camera_dashboard.git /tmp/dash && cp -r /tmp/dash/backend/* ~/dt/backend/ && rm -rf /tmp/dash";

  const handleImportFromJetson = async () => {
    try {
      setImporting(true);
      setMessage(null);
      const res = await api.post('/thresholds/import', {});
      setMessage({
        type: 'success',
        text: `Successfully imported ${res.data.imported_count} threshold records (version: ${res.data.table_version}) from ${res.data.source_file}`
      });
      await fetchThresholds();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 405 || status === 404) {
        setMessage({
          type: 'error',
          text: `Backend on Jetson is running an older build without /thresholds/import (HTTP ${status}). Run this command on Jetson to update: ${JETSON_UPDATE_CMD} (or run python3 scripts/direct_import_thresholds.py)`
        });
      } else {
        const detail = err.response?.data?.detail || err.message || 'Import failed';
        setMessage({ type: 'error', text: `Import failed: ${detail}` });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setMessage(null);

      // Attempt 1: Upload directly to backend API
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await api.post('/thresholds/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setMessage({
          type: 'success',
          text: `Uploaded and imported ${res.data.imported_count} threshold entries from ${file.name}`
        });
        await fetchThresholds();
        return;
      } catch (uploadErr: any) {
        const status = uploadErr.response?.status;
        // If 405 (Method Not Allowed) or 404, parse locally in browser as instant preview
        if (status === 405 || status === 404) {
          console.warn('/thresholds/upload not available (HTTP ' + status + '), parsing JSON client-side...');
          const text = await file.text();
          const parsed = JSON.parse(text);
          const version = parsed.version || 'v2.0';
          const rawIdentities = parsed.identities || {};
          const list = Array.isArray(rawIdentities) ? rawIdentities : Object.values(rawIdentities);

          if (list.length > 0) {
            const previewList: IdentityThreshold[] = list.map((item: any, idx: number) => ({
              threshold_id: `preview-${idx}`,
              threshold_table_version: version,
              identity_id: item.identity_id || item.person_id || `id-${idx}`,
              identity_name: item.full_name || item.name || item.identity_name || `Identity ${idx + 1}`,
              threshold_type: (item.threshold_type as any) || (item.gpd_fit ? 'identity_gpd' : 'global_evt'),
              threshold_value: Number(item.threshold ?? item.threshold_value ?? 0.265),
              fit_status: item.fit_status || 'fitted',
              fallback_used: Boolean(item.fallback_used ?? false),
              n_impostor_scores: item.n_impostor_scores ?? item.n_scores,
              n_exceedances: item.n_exceedances,
              model_version: parsed.model_version || 'adaface_ir101',
              created_at: new Date().toISOString()
            }));

            setThresholds(previewList);
            setMessage({
              type: 'success',
              text: `Loaded ${previewList.length} threshold records from ${file.name} into audit table! (To persist into Jetson DB, update Jetson backend using: ${JETSON_UPDATE_CMD})`
            });
            return;
          }
        }
        throw uploadErr;
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'File upload failed';
      setMessage({ type: 'error', text: `Upload failed: ${detail}` });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Identity-wise EVT Threshold Audit</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Generalized Pareto Distribution (GPD) fits, exceedance parameters, and global EVT fallback status per identity (Spec 13.6)
          </p>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".json"
              onChange={handleFileUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              <Upload size={16} />
              Upload JSON
            </button>

            <button
              onClick={handleImportFromJetson}
              disabled={importing}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={16} className={importing ? 'spin' : ''} />
              {importing ? 'Importing...' : 'Import from Jetson Storage'}
            </button>
          </div>
        )}
      </div>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? 'var(--accent-green)' : 'var(--accent-rose)'}`,
            color: message.type === 'success' ? '#34d399' : '#f87171'
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

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
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  Loading threshold records...
                </td>
              </tr>
            ) : thresholds.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                  <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <Sliders size={36} style={{ opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
                      No threshold entries loaded in database.
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Load calibrated EVT POT/GPD parameters from <code>~/open-set-face-recognition/thresholds/threshold_table.json</code> on Jetson.
                    </p>
                    {isAdmin && (
                      <button
                        onClick={handleImportFromJetson}
                        disabled={importing}
                        className="btn btn-primary"
                        style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <RefreshCw size={16} className={importing ? 'spin' : ''} />
                        Import threshold_table.json now
                      </button>
                    )}
                  </div>
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
