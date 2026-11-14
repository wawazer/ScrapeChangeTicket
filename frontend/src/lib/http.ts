export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
    ...options,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) {
    // LicenseGate listens for this and locks the workspace back to the activation screen.
    if (data.error === 'LICENSE_REQUIRED') window.dispatchEvent(new Event('zevn:license-required'));
    throw new ApiError(data.message || data.error || 'Permintaan gagal', response.status, data);
  }
  return data;
}

export interface LicenseStatus {
  valid: boolean;
  owner?: string;
  hostname?: string;
  deviceId?: string;
  reason?: string;
  message?: string;
}

export function fetchLicenseStatus() {
  return request<LicenseStatus>('/api/license/status');
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  try {
    return await request<LicenseStatus>('/api/license/activate', {
      method: 'POST',
      body: JSON.stringify({ licenseKey }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.body.valid === false) return error.body as unknown as LicenseStatus;
    throw error;
  }
}

export async function downloadFile(url: string, options: RequestInit, filename: string) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Export gagal. Periksa log aplikasi.');
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  return blob.size;
}

export function exportFilename(filter: string | undefined, extension: string) {
  const base = String(filter || 'servicenow')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `laporan-${base || 'servicenow'}.${extension}`;
}

export async function fetchTicketSummary(ticketNumber: string): Promise<import('./api').AISummary> {
  const data = await request<{ ok: boolean; data: import('./api').AISummary }>(`/api/tickets/${encodeURIComponent(ticketNumber)}/summary`);
  if (!data.ok) throw new Error('Gagal memuat ringkasan AI');
  return data.data;
}

export async function fetchTicketRisk(ticket: {
  description: string;
  assignedTo?: string;
  changeRequest?: string;
  category?: string;
}): Promise<import('./api').RiskAnalysisResult> {
  const data = await request<{ ok: boolean; data: import('./api').RiskAnalysisResult }>('/api/ai/analyze-risk', {
    method: 'POST',
    body: JSON.stringify(ticket),
  });
  if (!data.ok) throw new Error('Gagal memuat analisis risiko');
  return data.data;
}

export async function fetchDuplicateDetection(
  targetTicket: Record<string, unknown>,
  historicalTickets?: Array<Record<string, unknown>>
): Promise<import('./api').DuplicateDetectionResult> {
  const data = await request<{ ok: boolean; data: import('./api').DuplicateDetectionResult }>('/api/ai/detect-duplicates', {
    method: 'POST',
    body: JSON.stringify({ targetTicket, historicalTickets }),
  });
  if (!data.ok) throw new Error('Gagal memproses deteksi duplikasi');
  return data.data;
}

