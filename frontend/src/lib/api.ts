export interface TicketDetail {
  status?: { nama?: string; kode?: string };
  [key: string]: unknown;
}

export interface Ticket {
  nomor_tiket: string;
  data_tabel?: Record<string, string>;
  detail_tiket?: TicketDetail;
  activities?: Array<{ timestamp?: string; user?: string; type?: string; content?: string; comment?: string; work_notes?: string }>;
  scrape_status?: 'success' | 'failed' | 'pending';
  errors?: string[];
  validation_status?: 'valid' | 'warning' | 'invalid';
}

export interface RunMetadata {
  filter_name?: string;
  scraped_at?: string;
  total_found?: number;
  processed?: number;
  success?: number;
  failed?: number;
  pending?: number;
}

export interface Run {
  metadata?: RunMetadata;
  tickets: Ticket[];
}

export interface LogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type JobStatus =
  | 'idle'
  | 'starting'
  | 'reading'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface ExportInfo {
  ready: boolean;
  count: number;
  failed: number;
  total: number;
  filter: string;
  period: string;
  scrapedAt: string;
  reason: string;
}

export interface AppState {
  status: JobStatus;
  current: string;
  message: string;
  processed: number;
  total: number;
  logs: LogEntry[];
  selectedFilter: string;
  estimate: number;
  run: Run | null;
  connected: boolean;
  export: ExportInfo;
}

export interface AISummary {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  category: string;
}

export interface RiskAnalysisResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flaggedFactors: Array<{ factor: string; source: 'keyword' | 'llm' }>;
  recommendedMitigations: string[];
}


export interface FilterOption {
  name: string;
}

export const BUSY_STATUSES: JobStatus[] = ['starting', 'reading', 'running', 'paused'];

export function isBusy(status: JobStatus) {
  return BUSY_STATUSES.includes(status);
}
