import React, { useEffect, useRef, useState } from 'react';
import { DetectionBox } from '../types';
import { Video, Camera } from 'lucide-react';

interface VideoPlayerWithCanvasProps {
  frameBase64?: string;
  detections?: DetectionBox[];
  fps?: number;
}

export const VideoPlayerWithCanvas: React.FC<VideoPlayerWithCanvasProps> = ({
  frameBase64,
  detections = [],
  fps = 30.0
}) => {
  const [activeCam, setActiveCam] = useState<'camera_1' | 'camera_2'>('camera_1');
  const [streamError, setStreamError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const safeFps = typeof fps === 'number' && !isNaN(fps) ? fps : 30.0;
  const jetsonIp = localStorage.getItem('custom_backend_ip')?.split(':')[0] || '10.39.4.131';
  const streamUrl = `http://${jetsonIp}:5001/video_feed/${activeCam}`;

  // Reset stream error on camera switch
  const handleSwitchCam = (cam: 'camera_1' | 'camera_2') => {
    setActiveCam(cam);
    setStreamError(false);
  };

  // Periodic retry to reconnect camera stream
  useEffect(() => {
    if (streamError) {
      const timer = setTimeout(() => {
        setStreamError(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [streamError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous canvas frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!Array.isArray(detections)) return;

    // Draw real-time detection bounding boxes and labels
    detections.forEach((det) => {
      if (!det || !det.bbox) return;

      const { x1 = 0, y1 = 0, x2 = 100, y2 = 100 } = det.bbox;
      const width = Math.max(10, x2 - x1);
      const height = Math.max(10, y2 - y1);

      // Color coding based on status
      let strokeColor = '#10b981'; // Green for KNOWN
      if (det.status === 'UNKNOWN') strokeColor = '#f43f5e'; // Red for UNKNOWN
      if (det.status === 'ABSTAIN') strokeColor = '#f59e0b'; // Amber for ABSTAIN

      // Draw bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, width, height);

      // Label text
      const label = det.label || 'Unknown';
      const sim = typeof det.similarity === 'number' ? det.similarity.toFixed(2) : 'N/A';
      const thr = typeof det.threshold === 'number' ? det.threshold.toFixed(2) : 'N/A';
      const thrType = (det.threshold_type || 'FIXED').toUpperCase();

      const labelText = `${label} [sim=${sim} thr=${thr}]`;
      const badgeText = `${thrType}${det.fallback_used ? ' (FALLBACK)' : ''}`;

      ctx.font = 'bold 13px Inter, sans-serif';
      const textWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(badgeText).width) + 16;
      const textHeight = 40;

      // Label background box
      ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
      ctx.fillRect(x1, Math.max(0, y1 - textHeight), textWidth, textHeight);

      // Border on label box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, Math.max(0, y1 - textHeight), textWidth, textHeight);

      // Label text strings
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 8, Math.max(14, y1 - 22));

      ctx.fillStyle = det.fallback_used ? '#f59e0b' : '#818cf8';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(badgeText, x1 + 8, Math.max(28, y1 - 8));
    });
  }, [detections]);

  const isCam0 = activeCam === 'camera_1';

  return (
    <div>
      {/* Camera Switcher Buttons Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleSwitchCam('camera_1')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: isCam0 ? '1px solid #10b981' : '1px solid var(--border-glass)',
              background: isCam0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              color: isCam0 ? '#10b981' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              boxShadow: isCam0 ? '0 0 12px rgba(16, 185, 129, 0.25)' : 'none'
            }}
          >
            <Camera size={15} />
            Cam 0: CSI Camera
          </button>

          <button
            type="button"
            onClick={() => handleSwitchCam('camera_2')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: !isCam0 ? '1px solid #6366f1' : '1px solid var(--border-glass)',
              background: !isCam0 ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              color: !isCam0 ? '#818cf8' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              boxShadow: !isCam0 ? '0 0 12px rgba(99, 102, 241, 0.25)' : 'none'
            }}
          >
            <Video size={15} />
            Cam 1: RTSP Camera
          </button>
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Active feed: <code>{streamUrl}</code>
        </span>
      </div>

      {/* Main Video Viewport */}
      <div ref={containerRef} className="glass-panel" style={{
        position: 'relative',
        width: '100%',
        height: '480px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0c1322',
        borderRadius: 'var(--radius-lg)'
      }}>
        {/* Viewfinder Background Grid */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(99, 102, 241, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1
        }}>
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: isCam0 ? '#10b981' : '#818cf8',
            boxShadow: isCam0 ? '0 0 16px #10b981' : '0 0 16px #818cf8',
            marginBottom: '12px'
          }} />
          <h4 style={{ color: '#f8fafc', fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            {isCam0 ? 'Jetson CSI Camera (Cam 0)' : 'Network RTSP Camera (Cam 1)'}
          </h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '420px' }}>
            Connecting to <code>{streamUrl}</code>
          </p>
        </div>

        {/* Live Video Feed Image */}
        {streamUrl && (
          <img
            key={streamUrl}
            src={streamUrl}
            alt={isCam0 ? 'Live CSI Camera Feed' : 'Live RTSP Camera Feed'}
            onError={() => setStreamError(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 5,
              display: streamError ? 'none' : 'block'
            }}
          />
        )}

        {/* Canvas Bounding Box Overlay */}
        <canvas
          ref={canvasRef}
          width={800}
          height={480}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10
          }}
        />

        {/* Real-time Stream Status Badge Overlay */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 20,
          background: 'rgba(11, 15, 25, 0.85)',
          backdropFilter: 'blur(12px)',
          padding: '6px 14px',
          borderRadius: '20px',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.82rem',
          fontWeight: 600
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isCam0 ? '#10b981' : '#818cf8',
            boxShadow: isCam0 ? '0 0 8px #10b981' : '0 0 8px #818cf8'
          }} />
          <span>{isCam0 ? 'LIVE CSI CAMERA (CAM 0)' : 'LIVE RTSP CAMERA (CAM 1)'}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>{safeFps.toFixed(1)} FPS</span>
        </div>
      </div>
    </div>
  );
};
