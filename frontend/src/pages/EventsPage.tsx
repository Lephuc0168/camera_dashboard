import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { RecognitionEvent } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Filter, RefreshCw } from 'lucide-react';

export const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [cameraFilter, setCameraFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [thresholdTypeFilter, setThresholdTypeFilter] = useState<string>('');
  const [fallbackFilter, setFallbackFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cameraFilter) params.append('camera_id', cameraFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (thresholdTypeFilter) params.append('threshold_type', thresholdTypeFilter);
      if (fallbackFilter !== '') params.append('fallback_used', fallbackFilter);
      params.append('limit', '100');

      const response = await api.get(`/events?${params.toString()}`);
      setEvents(response.data);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    // Auto-refresh events every 3 seconds for real-time live monitoring
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [cameraFilter, statusFilter, thresholdTypeFilter, fallbackFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Recognition Event History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Historical record of all open-set recognition decisions stored in Jetson PostgreSQL
          </p>
        </div>
        <button onClick={() => fetchEvents()} className="glass-button" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'white', border: '1px solid var(--border-glass)' }}>
          <RefreshCw size={16} /> Refresh Log
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          <Filter size={16} /> Filter Events:
        </div>

        <select
          value={cameraFilter}
          onChange={(e) => setCameraFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="" style={optionStyle}>All Cameras</option>
          <option value="camera_01" style={optionStyle}>RTSP Camera 01</option>
          <option value="camera_02" style={optionStyle}>CSI Camera 02</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="" style={optionStyle}>All Statuses</option>
          <option value="KNOWN" style={optionStyle}>KNOWN</option>
          <option value="UNKNOWN" style={optionStyle}>UNKNOWN</option>
          <option value="ABSTAIN" style={optionStyle}>ABSTAIN</option>
        </select>

        <select
          value={thresholdTypeFilter}
          onChange={(e) => setThresholdTypeFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="" style={optionStyle}>All Threshold Types</option>
          <option value="identity_gpd" style={optionStyle}>Identity GPD</option>
          <option value="global_evt" style={optionStyle}>Global EVT</option>
          <option value="fixed" style={optionStyle}>Fixed Threshold</option>
        </select>

        <select
          value={fallbackFilter}
          onChange={(e) => setFallbackFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="" style={optionStyle}>All Fallback States</option>
          <option value="true" style={optionStyle}>Fallback Used Only</option>
          <option value="false" style={optionStyle}>Per-Identity Fit Only</option>
        </select>
      </div>

      {/* Events Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Camera</th>
              <th>Track ID</th>
              <th>Person Name</th>
              <th>Status</th>
              <th>Similarity</th>
              <th>Applied Threshold</th>
              <th>Threshold Strategy</th>
              <th>Fallback State</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  No recognition events found matching criteria.
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const isCam2 = ev.camera_code?.includes('2') || ev.camera_name?.includes('02') || ev.camera_name?.includes('CSI');
                const camDisplay = ev.camera_name || (isCam2 ? 'CSI Camera 02' : 'RTSP Camera 01');
                return (
                  <tr key={ev.event_id}>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(ev.occurred_at).toLocaleString()}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isCam2 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: isCam2 ? '#34d399' : '#818cf8',
                        border: `1px solid ${isCam2 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                      }}>
                        {camDisplay}
                      </span>
                    </td>
                    <td>#{ev.track_id}</td>
                    <td style={{ fontWeight: 600 }}>{ev.person_name || 'UNKNOWN'}</td>
                    <td>
                      <StatusBadge type={ev.status.toLowerCase() as any} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{ev.similarity ? ev.similarity.toFixed(3) : 'N/A'}</td>
                    <td>{ev.threshold_value ? ev.threshold_value.toFixed(3) : 'N/A'}</td>
                    <td>
                      <StatusBadge type={ev.threshold_type} />
                    </td>
                    <td>
                      {ev.fallback_used ? (
                        <span style={{ color: 'var(--accent-amber)', fontSize: '0.82rem', fontWeight: 600 }}>FALLBACK</span>
                      ) : (
                        <span style={{ color: 'var(--accent-green)', fontSize: '0.82rem', fontWeight: 600 }}>PER-IDENTITY FIT</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  background: '#131b2e',
  border: '1px solid var(--border-glass)',
  borderRadius: 'var(--radius-md)',
  color: '#f8fafc',
  padding: '8px 14px',
  fontSize: '0.88rem',
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  colorScheme: 'dark'
};

const optionStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  color: '#f8fafc',
  padding: '8px 12px'
};
