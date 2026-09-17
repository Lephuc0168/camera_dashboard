export interface User {
  user_id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  created_at: string;
}

export interface Person {
  person_id: string;
  student_code?: string;
  full_name: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  embedding_count: number;
  photo_url?: string;
  quality_score?: number;
}

export interface Camera {
  camera_id: string;
  camera_code: string;
  name: string;
  source_type: string;
  source_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface RecognitionEvent {
  event_id: string;
  camera_id?: string;
  track_id: number;
  person_id?: string;
  person_name?: string;
  status: 'KNOWN' | 'UNKNOWN' | 'ABSTAIN' | 'ERROR';
  similarity?: number;
  threshold_value?: number;
  threshold_type: 'identity_gpd' | 'global_evt' | 'fixed';
  fallback_used: boolean;
  quality_score?: number;
  model_version?: string;
  threshold_table_version?: string;
  error_code?: string;
  occurred_at: string;
  snapshot_path?: string;
}

export interface IdentityThreshold {
  threshold_id: string;
  threshold_table_version: string;
  identity_id?: string;
  identity_name?: string;
  threshold_type: 'identity_gpd' | 'global_evt' | 'fixed';
  threshold_value: number;
  fallback_used: boolean;
  n_impostor_scores?: number;
  n_exceedances?: number;
  u_quantile?: number;
  u_value?: number;
  alpha?: number;
  gpd_shape?: number;
  gpd_scale?: number;
  fit_status: 'valid' | 'warning' | 'failed' | 'fallback';
  model_version: string;
  created_at: string;
}

export interface StatsSummary {
  total_events: number;
  known_count: number;
  unknown_count: number;
  abstain_count: number;
  fallback_count: number;
  fallback_rate: number;
  identity_gpd_count: number;
  global_evt_count: number;
  fixed_count: number;
}

export interface DetectionBox {
  track_id: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  status: 'KNOWN' | 'UNKNOWN' | 'ABSTAIN';
  person_id?: string;
  label: string;
  similarity: number;
  threshold: number;
  threshold_type: 'identity_gpd' | 'global_evt' | 'fixed';
  fallback_used: boolean;
}

export interface WebSocketInferencePayload {
  type: string;
  timestamp: string;
  camera_id: string;
  fps: number;
  detections: DetectionBox[];
}
