import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { RecognitionEvent } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Filter, RefreshCw } from 'lucide-react';

export const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [thresholdTypeFilter, setThresholdTypeFilter] = useState<string>('');
  const [fallbackFilter, setFallbackFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
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
  }, [statusFilter, thresholdTypeFilter, fallbackFilter]);

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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          <option value="KNOWN">KNOWN</option>
          <option value="UNKNOWN">UNKNOWN</option>
          <option value="ABSTAIN">ABSTAIN</option>
        </select>

        <select
          value={thresholdTypeFilter}
          onChange={(e) => setThresholdTypeFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Threshold Types</option>
          <option value="identity_gpd">Identity GPD</option>
          <option value="global_evt">Global EVT</option>
          <option value="fixed">Fixed Threshold</option>
        </select>

        <select
          value={fallbackFilter}
          onChange={(e) => setFallbackFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Fallback States</option>
          <option value="true">Fallback Used Only</option>
          <option value="false">Per-Identity Fit Only</option>
        </select>
      </div>

      {/* Events Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Timestamp</th>
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
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  No recognition events found matching criteria.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.event_id}>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(ev.occurred_at).toLocaleString()}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid var(--border-glass)',
  borderRadius: 'var(--radius-md)',
  color: 'white',
  padding: '8px 12px',
  fontSize: '0.88rem',
  outline: 'none',
  cursor: 'pointer'
};
