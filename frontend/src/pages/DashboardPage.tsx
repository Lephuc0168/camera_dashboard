import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { InferenceWebSocket } from '../services/websocket';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import { VideoPlayerWithCanvas, CameraFeed } from '../components/VideoPlayerWithCanvas';
import { DetectionBox, RecognitionEvent, StatsSummary } from '../types';
import { UserCheck, UserX, AlertTriangle, Cpu, RefreshCw, Activity, HardDrive, Thermometer } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecognitionEvent[]>([]);
  const [feeds, setFeeds] = useState<Record<string, CameraFeed>>({});
  const [detections, setDetections] = useState<DetectionBox[]>([]);
  const [frameBase64, setFrameBase64] = useState<string | undefined>(undefined);
  const [fps, setFps] = useState<number>(30.0);
  const [hwStats, setHwStats] = useState<{ cpu?: number; gpu?: number; ram?: number; temp?: number }>({
    cpu: 34,
    gpu: 48,
    ram: 42,
    temp: 51
  });
  const [selectedCam, setSelectedCam] = useState<string>('camera_01');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDashboardData = async (cam = selectedCam) => {
    try {
      setErrorMsg(null);
      const camParam = cam ? `&camera_id=${encodeURIComponent(cam)}` : '';
      const [statsRes, eventsRes] = await Promise.all([
        api.get('/stats/summary'),
        api.get(`/events?limit=30${camParam}`)
      ]);
      setStats(statsRes.data || null);
      setRecentEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      const detail = err.response?.data?.detail || err.response?.data?.message;
      if (detail) {
        setErrorMsg(detail);
      } else if (err.message === 'Network Error') {
        setErrorMsg('Network Error: Không thể kết nối tới Backend FastAPI (cổng 8000). Hãy kiểm tra service backend và chạy "bash scripts/fix_jetson_db.sh" trên Jetson.');
      } else {
        setErrorMsg(err.message || 'Failed to connect to API');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedCam);
    // Auto-refresh events & stats every 3 seconds for the currently selected camera
    const interval = setInterval(() => {
      fetchDashboardData(selectedCam);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedCam]);

  useEffect(() => {
    // Setup real-time WebSocket connection for live inference metadata
    let ws: InferenceWebSocket | null = null;
    try {
      ws = new InferenceWebSocket((data: any) => {
        const camId = data && data.camera_id ? String(data.camera_id) : 'camera_01';
        if (data && Array.isArray(data.detections)) {
          setDetections(data.detections);
        }
        if (data && data.frame_base64) {
          setFrameBase64(data.frame_base64);
        }
        if (data && (data.detections || data.frame_base64)) {
          setFeeds((prev) => {
            const next = { ...prev };
            const existing = next[camId] || {};
            next[camId] = {
              ...existing,
              ...(data.detections ? { detections: data.detections } : {}),
              ...(data.frame_base64 ? { frameBase64: data.frame_base64 } : {}),
              ...(typeof data.fps === 'number' ? { fps: data.fps } : {}),
            };
            return next;
          });
        }
        if (data && typeof data.fps === 'number') {
          setFps(data.fps);
        }
        if (data && data.stats) {
          setHwStats(data.stats);
        }
      });
      ws.connect();
    } catch (e) {
      console.warn('WebSocket init failed:', e);
    }

    return () => {
      if (ws) ws.disconnect();
    };
  }, []);

  const isCam2 = selectedCam.includes('2') && !selectedCam.includes('01');
  const activeCamLabel = isCam2 ? 'CSI Camera 02' : 'RTSP Camera 01';

  const filteredEvents = recentEvents.filter((ev) => {
    if (!ev.camera_code) return true;
    const isEvCam2 = ev.camera_code.includes('2') && !ev.camera_code.includes('01');
    return isCam2 ? isEvCam2 : !isEvCam2;
  });

  const fallbackRate = typeof stats?.fallback_rate === 'number' ? stats.fallback_rate : Number(stats?.fallback_rate || 0);
  const safeFps = typeof fps === 'number' && !isNaN(fps) ? fps : 30.0;

  return (
    <div style={{ paddingBottom: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Live Monitoring Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            NVIDIA DeepStream + Identity-wise EVT Open-Set Face Recognition
          </p>
        </div>
        <button onClick={() => fetchDashboardData(selectedCam)} className="glass-button" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'white', border: '1px solid var(--border-glass)' }}>
          <RefreshCw size={16} /> Refresh Stats
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>
          <strong>API Sync Status:</strong> {errorMsg}
        </div>
      )}

      {/* Main KPI Cards Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <KpiCard
          title="Known Identity Detections"
          value={stats?.known_count ?? 0}
          subtext="Verified Gallery Matches"
          icon={UserCheck}
          color="#10b981"
        />
        <KpiCard
          title="Unknown Rejections"
          value={stats?.unknown_count ?? 0}
          subtext="Open-Set Rejected Identities"
          icon={UserX}
          color="#f43f5e"
        />
        <KpiCard
          title="EVT Fallback Decisions"
          value={`${(fallbackRate * 100).toFixed(1)}%`}
          subtext={`${stats?.fallback_count ?? 0} Fallback Events`}
          icon={AlertTriangle}
          color="#f59e0b"
        />
        <KpiCard
          title="Pipeline Frame Rate"
          value={`${safeFps.toFixed(1)} FPS`}
          subtext="Live Pipeline Speed"
          icon={Cpu}
          color="#06b6d4"
        />
      </div>

      {/* Jetson Edge Hardware Telemetry Strip */}
      <div className="glass-panel" style={{
        padding: '12px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        flexWrap: 'wrap',
        gap: '16px',
        background: 'rgba(15, 23, 42, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={18} color="#818cf8" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Jetson GPU Load:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#818cf8' }}>{hwStats.gpu ?? 45}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={18} color="#38bdf8" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>CPU Utilization:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>{hwStats.cpu ?? 32}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HardDrive size={18} color="#34d399" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Unified RAM:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399' }}>{hwStats.ram ?? 41}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Thermometer size={18} color="#fbbf24" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chip SoC Temp:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24' }}>{hwStats.temp ?? 50}°C</span>
        </div>
      </div>

      {/* Main Grid: Video Stream + Recent Events */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px' }}>
        <div>
          <VideoPlayerWithCanvas
            feeds={feeds}
            detections={detections}
            frameBase64={frameBase64}
            fps={safeFps}
            activeCam={selectedCam}
            onCameraChange={(cam) => setSelectedCam(cam)}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Recent Recognition Events</h3>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '12px',
              background: isCam2 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
              color: isCam2 ? '#10b981' : '#818cf8',
              border: `1px solid ${isCam2 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
            }}>
              {activeCamLabel}
            </span>
          </div>
          <div className="glass-panel" style={{ padding: '16px', maxHeight: '480px', overflowY: 'auto' }}>
            {filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px 0' }}>
                <Activity size={32} color="var(--text-dim)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p>No events recorded yet for {activeCamLabel}.</p>
                <span style={{ fontSize: '0.78rem' }}>Waiting for faces detected by DeepStream...</span>
              </div>
            ) : (
              filteredEvents.map((ev, index) => (
                <div key={ev.event_id || index} style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  marginBottom: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {ev.person_name || (ev.status === 'UNKNOWN' ? 'UNKNOWN PERSON' : 'UNASSIGNED')}
                    </span>
                    <StatusBadge type={(ev.status || 'KNOWN').toLowerCase()} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                    <span>Sim: <strong>{typeof ev.similarity === 'number' ? ev.similarity.toFixed(3) : 'N/A'}</strong></span>
                    <span>Thr: <strong>{typeof ev.threshold_value === 'number' ? ev.threshold_value.toFixed(3) : 'N/A'}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    <StatusBadge type={ev.threshold_type || 'fixed'} label={ev.fallback_used ? `${ev.threshold_type || 'fixed'} (FALLBACK)` : (ev.threshold_type || 'fixed')} />
                    <span>{ev.occurred_at ? new Date(ev.occurred_at).toLocaleTimeString() : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
