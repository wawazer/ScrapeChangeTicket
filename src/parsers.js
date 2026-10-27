import { cleanText, slug, ticketNumber, uniqueBy } from './utils.js';

const aliases = {
  nomor_tiket: ['no tiket', 'nomor tiket', 'ticket number', 'number', 'no ticket', 'task number'],
  created: ['created', 'dibuat', 'tiket dibuat', 'created on'],
  change_request: ['change request', 'request perubahan'],
  judul_task: ['judul task', 'task title', 'short description', 'title'],
  judul_permasalahan: ['judul permasalahan', 'problem title', 'problem statement', 'issue title'],
  ditugaskan_kepada: ['ditugaskan kepada', 'assigned to', 'assignee'],
  configuration_item: ['configuration item', 'ci'],
  tipe_task: ['tipe task', 'task type', 'type'],
  deskripsi_permasalahan: ['deskripsi permasalahan', 'description', 'problem description', 'deskripsi'],
  kelompok_yang_ditugaskan: ['kelompok yang ditugaskan', 'assignment group', 'assigned group'],
  pic: ['pic', 'person in charge'],
  service_offering: ['service offering'],
  status: ['status', 'state'],
  prioritas: ['prioritas', 'priority'],
  start_date: ['start date', 'tanggal mulai'],
  end_date: ['end date', 'tanggal selesai'],
  requestor: ['requestor', 'requested by', 'pemohon'],
  nipp_nrk: ['nipp/nrk', 'nipp nrk', 'nipp', 'nrk'],
  contact: ['contact', 'kontak', 'phone', 'telephone'],
  email: ['email', 'e-mail'],
  location: ['location', 'lokasi'],
  application: ['application', 'aplication', 'aplikasi'],
  change: ['change', 'change request', 'request perubahan'],
  ip_address_server: ['ip address server', 'server ip', 'ip address'],
  version: ['version', 'versi'],
  directory: ['directory', 'direktori', 'path'],
  cause: ['cause', 'penyebab'],
  action_plan: ['action plan', 'rencana tindakan']
};

const normalizeLabel = (value) => cleanText(value).toLowerCase().replace(/[.:/()_-]+/g, ' ').replace(/\s+/g, ' ');
const matches = (label, candidates) => candidates.some((candidate) => {
  const a = normalizeLabel(label); const b = normalizeLabel(candidate);
  return a === b || a.includes(b) || b.includes(a);
});

export function mapColumns(headers = []) {
  const result = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const index = headers.findIndex((header) => matches(header, candidates));
    if (index >= 0) result[field] = index;
  }
  return result;
}

function rowValue(row, index) {
  if (index === undefined) return '';
  const cell = row.cells?.[index] ?? row[index];
  return typeof cell === 'object' ? (cell.text ?? cell.value ?? '') : cell ?? '';
}

export function parseTableRows({ headers = [], rows = [] } = {}) {
  const effectiveHeaders = headers.length ? headers : (rows[0]?.cells || []).map((cell, index) => cell.field || `column_${index + 1}`);
  const mapping = mapColumns(effectiveHeaders);
  return rows.map((row) => {
    const data = {};
    effectiveHeaders.forEach((header, index) => { data[slug(header) || `column_${index + 1}`] = cleanText(rowValue(row, index)); });
    const link = row.cells?.find((cell) => cell.href)?.href || row.href || '';
    const metadataCell = row.cells?.find((cell) => matches(cell.field || '', aliases.nomor_tiket));
    const numberFromMapped = rowValue(row, mapping.nomor_tiket) || metadataCell?.text;
    const number = ticketNumber(numberFromMapped) || ticketNumber(row.text || row.map?.(String).join(' '));
    return { nomor_tiket: number, href: link, values: data };
  }).filter((row) => row.nomor_tiket);
}

export function deduplicateTickets(rows) {
  return uniqueBy(rows, (row) => row.nomor_tiket || row.href || JSON.stringify(row.values));
}

function htmlEntities(value) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

export function htmlToText(html = '') {
  return htmlEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

function valueFromFields(fields, fieldName) {
  const candidates = aliases[fieldName] || [fieldName];
  const entry = Object.entries(fields || {}).find(([label]) => matches(label, candidates));
  return entry?.[1];
}

export function parseStatus(value) {
  if (value && typeof value === 'object') {
    return { kode: cleanText(value.kode ?? value.code ?? value.value), nama: cleanText(value.nama ?? value.label ?? value.text) };
  }
  const text = cleanText(value);
  return { kode: '', nama: text };
}

export function parseDetailFields({ fields = {}, statusOptions = {}, descriptionHtml = '' } = {}) {
  const raw = {};
  for (const field of Object.keys(aliases)) raw[field] = cleanText(valueFromFields(fields, field));
  const statusRaw = valueFromFields(fields, 'status');
  const status = parseStatus(statusRaw);
  if (!status.kode && status.nama) {
    const option = Object.entries(statusOptions).find(([, name]) => normalizeLabel(name) === normalizeLabel(status.nama));
    if (option) status.kode = option[0];
  }
  const html = descriptionHtml || fields.description_html || valueFromFields(fields, 'deskripsi_permasalahan_html') || '';
  raw.nomor_tiket = ticketNumber(raw.nomor_tiket) || raw.nomor_tiket;
  raw.status = status;
  raw.deskripsi_permasalahan_html = html;
  raw.deskripsi_permasalahan_text = htmlToText(html || raw.deskripsi_permasalahan);
  return raw;
}

export function parseActivities(items = []) {
  return items.map((item) => ({
    timestamp: cleanText(item.timestamp || item.time || item.date),
    user: cleanText(item.user || item.author || item.pengguna),
    type: cleanText(item.type || item.activity_type || item.kind),
    content: cleanText(item.content || item.body || item.text),
    field: cleanText(item.field || item.field_name),
    old_value: cleanText(item.old_value || item.oldValue),
    new_value: cleanText(item.new_value || item.newValue),
    comment: cleanText(item.comment),
    work_notes: cleanText(item.work_notes || item.workNotes)
  })).filter((item) => Object.values(item).some(Boolean));
}

export function makeMetadata({ filterName, totalFound, tickets, scrapedAt = new Date().toISOString() }) {
  const processed = tickets.filter((ticket) => ['success', 'failed'].includes(ticket.scrape_status)).length;
  return {
    source: 'ServiceNow Pelindo', filter_name: filterName || '', scraped_at: scrapedAt,
    total_found: totalFound ?? tickets.length, processed,
    success: tickets.filter((ticket) => ticket.scrape_status === 'success').length,
    failed: tickets.filter((ticket) => ticket.scrape_status === 'failed').length,
    pending: tickets.filter((ticket) => ticket.scrape_status === 'pending').length,
    cancelled: tickets.filter((ticket) => ticket.scrape_status === 'cancelled').length
  };
}

export function validateExportData(data) {
  if (!data || typeof data !== 'object' || !data.metadata || !Array.isArray(data.tickets)) throw new Error('Struktur hasil tidak valid');
  for (const ticket of data.tickets) {
    if (!ticket.nomor_tiket) throw new Error('Tiket tanpa nomor_tiket tidak dapat diekspor');
    if (!Array.isArray(ticket.errors)) throw new Error(`errors tidak valid untuk ${ticket.nomor_tiket}`);
  }
  return true;
}

export function reportTicket(ticket, overrides = {}) {
  const detail = ticket.detail_tiket || {};
  const table = ticket.data_tabel || {};
  const value = (key, ...fallbacks) => overrides[key] ?? detail[key] ?? table[key] ?? fallbacks.map((fallback) => detail[fallback] ?? table[fallback]).find((item) => item !== undefined && item !== '') ?? '-';
  return {
    date: value('date', 'created'),
    ticket_number: ticket.nomor_tiket,
    requestor: value('requestor'),
    nipp_nrk: value('nipp_nrk'),
    contact: value('contact'),
    email: value('email'),
    location: value('location'),
    application: value('application', 'configuration_item'),
    change: value('change', 'change_request'),
    ip_address_server: value('ip_address_server'),
    version: value('version'),
    directory: value('directory'),
    pic: value('pic', 'ditugaskan_kepada'),
    description: overrides.description ?? detail.deskripsi_permasalahan_text ?? (htmlToText(detail.deskripsi_permasalahan_html || '') || '-'),
    result: overrides.result ?? detail.result ?? ticket.report?.result ?? 'Other',
    cause: value('cause'),
    action_plan: value('action_plan')
  };
}
