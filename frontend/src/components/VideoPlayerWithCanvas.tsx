import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DetectionBox } from '../types';
import { Video, Camera } from 'lucide-react';

export interface CameraFeed {
  frameBase64?: string;
  detections?: DetectionBox[];
  fps?: number;
  streamUrl?: string;
  name?: string;
}

interface VideoPlayerWithCanvasProps {
  feeds?: Record<string, CameraFeed>;
  detections?: DetectionBox[];
  frameBase64?: string;
  fps?: number;
}

const FALLBACK_STREAM_URL = 'http://10.39.4.131:5001/video_feed/camera_1';

const CAM_ORDER = ['camera_01', 'camera_02', 'camera_1', 'camera_2'];

const CAM_DEFAULT_NAMES: Record<string, string> = {
  camera_1: 'CSI Camera (Cam 0)',
  camera_2: 'RTSP Camera (Cam 1)',
  camera_01: 'RTSP Camera 01',
  camera_02: 'CSI Camera 02',
};

export const VideoPlayerWithCanvas: React.FC<VideoPlayerWithCanvasProps> = ({
  feeds,
  detections = [],
  frameBase64,
  fps = 30.0
}) => {
  const feedKeys = feeds ? Object.keys(feeds) : [];
  const orderedKeys = [...feedKeys].sort(
    (a, b) => (CAM_ORDER.indexOf(a) === -1 ? 99 : CAM_ORDER.indexOf(a)) - (CAM_ORDER.indexOf(b) === -1 ? 99 : CAM_ORDER.indexOf(b))
  );

  const [activeCam, setActiveCam] = useState<string | null>(null);
  const active = activeCam && feedKeys.includes(activeCam) ? activeCam : (orderedKeys[0] || null);
  const [streamError, setStreamError] = useState(false);

  const currentFeed = active ? feeds?.[active] : undefined;
  const liveFrame = currentFeed?.frameBase64 ?? (active ? undefined : frameBase64);
  const liveDets = currentFeed?.detections ?? detections;
  const liveFps = currentFeed?.fps ?? fps;

  const jetsonIp = localStorage.getItem('custom_backend_ip')?.split(':')[0] || window.location.hostname || '127.0.0.1';
  let effectiveCid = active || 'camera_1';
  if (effectiveCid === 'camera_01') effectiveCid = 'camera_1';
  else if (effectiveCid === 'camera_02') effectiveCid = 'camera_2';

  const token = localStorage.getItem('access_token') || '';
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  const proxyUrl = `http://${jetsonIp}:8000/api/v1/cameras/stream/${effectiveCid}${tokenQuery}`;
  const directUrl = `http://${jetsonIp}:5001/video_feed/${effectiveCid}`;

  const fallbackStreamUrl = currentFeed?.streamUrl
    || (streamError ? directUrl : proxyUrl);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoSizeRef = useRef<{ w: number; h: number } | null>(null);

  const safeFps = typeof liveFps === 'number' && !isNaN(liveFps) ? liveFps : 30.0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container) return;
    if (img && img.naturalWidth && img.naturalHeight) {
      videoSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    }
    const vid = videoSizeRef.current;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    if (!vid) return;
    const iw = vid.w;
    const ih = vid.h;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const offX = (cw - dw) / 2;
    const offY = (ch - dh) / 2;

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    (liveDets || []).forEach((det) => {
      if (!det || !det.bbox) return;

      const { x1 = 0, y1 = 0, x2 = 100, y2 = 100 } = det.bbox;
      const width = Math.max(10, x2 - x1);
      const height = Math.max(10, y2 - y1);

      let strokeColor = '#10b981';
      if (det.status === 'UNKNOWN') strokeColor = '#f43f5e';
      if (det.status === 'ABSTAIN') strokeColor = '#f59e0b';

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3 / scale;
      ctx.strokeRect(x1, y1, width, height);

      const label = det.label || 'Unknown';
      const sim = typeof det.similarity === 'number' ? det.similarity.toFixed(2) : 'N/A';
      const thr = typeof det.threshold === 'number' ? det.threshold.toFixed(2) : 'N/A';
      const thrType = (det.threshold_type || 'FIXED').toUpperCase();

      const labelText = `${label} [sim=${sim} thr=${thr}]`;
      const badgeText = `${thrType}${det.fallback_used ? ' (FALLBACK)' : ''}`;

      ctx.font = `bold ${13 / scale}px Inter, sans-serif`;
      const textWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(badgeText).width) + 16;
      const textHeight = 40 / scale;

      ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
      ctx.fillRect(x1, Math.max(0, y1 - textHeight), textWidth, textHeight);

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1 / scale;
      ctx.strokeRect(x1, Math.max(0, y1 - textHeight), textWidth, textHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 8 / scale, Math.max(14 / scale, y1 - 22 / scale));

      ctx.fillStyle = det.fallback_used ? '#f59e0b' : '#818cf8';
      ctx.font = `${11 / scale}px Inter, sans-serif`;
      ctx.fillText(badgeText, x1 + 8 / scale, Math.max(28 / scale, y1 - 8 / scale));
    });
    ctx.restore();
  }, [liveDets]);

  useEffect(() => {
    draw();
  }, [draw, liveFrame]);

  const handleImgLoad = useCallback(() => {
    setStreamError(false);
    draw();
  }, [draw]);

  const handleSwitchCam = (cam: string) => {
    setActiveCam(cam);
    setStreamError(false);
    videoSizeRef.current = null;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blockEvent = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    container.addEventListener('contextmenu', blockEvent, { capture: true });
    container.addEventListener('dragstart', blockEvent, { capture: true });
    container.addEventListener('selectstart', blockEvent, { capture: true });
    return () => {
      container.removeEventListener('contextmenu', blockEvent, { capture: true });
      container.removeEventListener('dragstart', blockEvent, { capture: true });
      container.removeEventListener('selectstart', blockEvent, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (streamError) {
      const timer = setTimeout(() => {
        setStreamError(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [streamError]);

  const activeImageSrc = liveFrame
    ? (liveFrame.startsWith('data:') ? liveFrame : `data:image/jpeg;base64,${liveFrame}`)
    : fallbackStreamUrl;

  const isSingle = orderedKeys.length <= 1;
  const camNames = CAM_DEFAULT_NAMES;

  return (
    <div>
      {!isSingle && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {orderedKeys.map((cam) => {
              const isActive = cam === active;
              const color = isActive ? '#10b981' : 'var(--text-muted)';
              const isRts = cam.includes('2') && !cam.includes('01');
              return (
                <button
                  key={cam}
                  type="button"
                  onClick={() => handleSwitchCam(cam)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: isActive ? `1px solid ${isRts ? '#6366f1' : '#10b981'}` : '1px solid var(--border-glass)',
                    background: isActive ? (isRts ? 'rgba(99, 102, 241, 0.25)' : 'rgba(16, 185, 129, 0.2)') : 'rgba(255, 255, 255, 0.04)',
                    color,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? (isRts ? '0 0 12px rgba(99, 102, 241, 0.25)' : '0 0 12px rgba(16, 185, 129, 0.25)') : 'none'
                  }}
                >
                  {isRts ? <Video size={15} /> : <Camera size={15} />}
                  {camNames[cam] || cam}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="glass-panel"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative',
          width: '100%',
          height: '480px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c1322',
          borderRadius: 'var(--radius-lg)',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
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
            background: '#10b981',
            boxShadow: '0 0 16px #10b981',
            marginBottom: '12px'
          }} />
          <h4 style={{ color: '#f8fafc', fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            {active ? (camNames[active] || active) : 'Jetson Camera Stream'}
          </h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '420px' }}>
            Connecting to secure camera feed...
          </p>
        </div>

        {activeImageSrc && (
          <img
            key={streamError ? 'err' : 'live'}
            ref={imgRef}
            src={activeImageSrc}
            alt="Live Camera Feed"
            onLoad={handleImgLoad}
            onError={() => setStreamError(true)}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 5,
              opacity: streamError && !liveFrame ? 0.15 : 1,
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
          />
        )}

        <canvas
          ref={canvasRef}
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

        {/* Transparent Protection Shield to block context menu and image grabbing */}
        <div
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 15,
            background: 'transparent',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            cursor: 'default'
          }}
        />

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
            background: (!streamError || liveFrame) ? '#10b981' : '#f59e0b',
            boxShadow: (!streamError || liveFrame) ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
          }} />
          <span>LIVE {active ? (camNames[active] || active).toUpperCase() : 'CAMERA'}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>{safeFps.toFixed(1)} FPS</span>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerWithCanvas;