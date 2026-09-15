import { WebSocketInferencePayload } from '../types';

export class InferenceWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessageCallback: (data: WebSocketInferencePayload) => void;
  private isConnected: boolean = false;
  private reconnectTimer: any = null;
  constructor(onMessage: (data: WebSocketInferencePayload) => void) {
    const customIp = localStorage.getItem('custom_backend_ip');
    const defaultHost = customIp || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '10.39.4.131:8000' : `${window.location.hostname}:8000`);
    const host = (import.meta as any).env?.VITE_WS_HOST || defaultHost;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${host}/ws/inference`;
    this.onMessageCallback = onMessage;
  }

  public connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('Inference WebSocket connected');
        this.isConnected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WebSocketInferencePayload = JSON.parse(event.data);
          if (data.type === 'inference_update') {
            this.onMessageCallback(data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket JSON:', err);
        }
      };

      this.ws.onclose = () => {
        console.warn('Inference WebSocket disconnected. Retrying in 3s...');
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        this.ws?.close();
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, 3000);
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
