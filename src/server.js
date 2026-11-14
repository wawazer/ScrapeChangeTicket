import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { error, info, warn } from './logger.js';
import { ServiceNowClient } from './servicenow.js';
import { createRun, checkpointPath, saveRun, upsertTicket } from './store.js';
import { generatePdf } from './pdf.js';
import { generateExcel } from './excel.js';
import { validateTicketData } from './parsers.js';
import { summarizeTicket } from './ai/summary.js';
import { analyzeRisk } from './ai/analysis.js';
import { detectDuplicates } from './ai/duplicate.js';
import { deactivateLicense, verifyLicenseOnline } from './license.js';
import { printBanner } from '../scripts/banner.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(root, '..', 'public')));

async function requireValidLicense(_req, res, next) {
  try {
    const result = await verifyLicenseOnline();
    if (result.valid) return next();
    return res.status(403).json({ error: 'LICENSE_REQUIRED', reason: result.reason, message: result.message, deviceId: result.deviceId, hostname: result.hostname });
  } catch (err) {
    return next(err);
  }
}

// Playwright and AI endpoints stay locked; the SPA shell and license routes stay reachable.
const LICENSE_GATED_PREFIXES = ['/api/scrape', '/api/ai', '/api/session', '/api/login', '/api/filters', '/api/estimate', '/api/requests', '/api/tickets'];
app.use((req, res, next) => (LICENSE_GATED_PREFIXES.some((prefix) => req.path.startsWith(prefix)) ? requireValidLicense(req, res, next) : next()));

app.get('/api/license/status', async (_req, res) => res.json(await verifyLicenseOnline()));
app.post('/api/license/activate', async (req, res) => {
  const licenseKey = String(req.body?.licenseKey || '').trim();
  if (!licenseKey) return res.status(400).json({ valid: false, reason: 'NO_LICENSE', message: 'License key wajib diisi.' });
  const result = await verifyLicenseOnline(licenseKey);
  return res.status(result.valid ? 200 : 403).json(result);
});
app.post('/api/license/deactivate', (_req, res) => { deactivateLicense(); res.json({ ok: true }); });

const state = {
  client: null, filters: [], selectedFilter: '', estimate: 0, run: null, runFile: '',
  evidence: {},
  job: { status: 'idle', current: '', message: '', processed: 0, total: 0, logs: [] },
  aiSummaries: new Map(),
};

function addLog(message, level = 'info') {
  state.job.logs.push({ at: new Date().toISOString(), level, message });
  state.job.logs = state.job.logs.slice(-100);
}

const BUSY_STATUSES = ['starting', 'reading', 'running', 'paused'];

const hasUsefulValue = (value) => value !== undefined && value !== null && !['', '-'].includes(String(value).trim());
const firstUseful = (...values) => values.find(hasUsefulValue) ?? '-';

function successfulTickets() {
  return state.run ? state.run.tickets.filter((ticket) => ticket.scrape_status === 'success') : [];
}

function exportSummary() {
  const run = state.run;
  const metadata = run?.metadata || {};
  const tickets = run?.tickets || [];
  const success = tickets.filter((ticket) => ticket.scrape_status === 'success').length;
  const failed = tickets.filter((ticket) => ticket.scrape_status === 'failed').length;
  const busy = BUSY_STATUSES.includes(state.job.status);
  const filter = metadata.filter_name || state.selectedFilter || '';
  let reason = '';
  if (!run) reason = 'Belum ada hasil scraping. Jalankan scraping terlebih dahulu.';
  else if (busy) reason = 'Scraping sedang berjalan. Export tersedia setelah selesai.';
  else if (!success) reason = 'Belum ada tiket berhasil diproses pada hasil scraping ini.';
  else if (failed) reason = `${failed} tiket gagal diproses dan tidak disertakan pada file export.`;
  return { ready: Boolean(run) && !busy && success > 0, count: success, failed, total: tickets.length, filter, period: filter, scrapedAt: metadata.scraped_at || '', reason };
}

function safeName(value) {
  return String(value || 'servicenow').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'servicenow';
}

function publicState() {
  return { ...state.job, selectedFilter: state.selectedFilter, estimate: state.estimate, run: state.run ? { metadata: state.run.metadata, tickets: state.run.tickets } : null, connected: Boolean(state.client?.page), export: exportSummary() };
}

async function ensureClient() {
  if (!state.client) state.client = new ServiceNowClient();
  await state.client.launch();
  return state.client;
}

async function runScrape({ limit = 0, includeScreenshot = false } = {}) {
  const client = await ensureClient();
  state.job = { ...state.job, status: 'reading', message: 'Membaca seluruh halaman tabel…', logs: state.job.logs };
  addLog('Membaca tabel aktif dan pagination');
  const listing = await client.readAllTickets();
  const selected = limit > 0 ? listing.tickets.slice(0, limit) : listing.tickets;
  state.run = createRun(state.selectedFilter);
  state.run.metadata.total_found = listing.tickets.length;
  state.run.tickets = selected.map((row) => ({ nomor_tiket: row.nomor_tiket, data_tabel: row.values, detail_tiket: {}, activities: [], activities_status: 'pending', activities_error: null, scrape_status: 'pending', errors: [], report: { result: 'Other' } }));
  state.runFile = checkpointPath(config.outputDir, state.selectedFilter);
  await saveRun(state.run, state.runFile);
  state.job.total = selected.length; state.job.processed = 0; state.job.status = 'running';
  addLog(`Ditemukan ${listing.tickets.length} tiket; memproses ${selected.length}`);
  for (const row of selected) {
    if (state.job.status === 'cancelled') break;
    while (state.job.status === 'paused') await new Promise((resolve) => { state.job.resume = resolve; });
    state.job.current = row.nomor_tiket; addLog(`Memproses ${row.nomor_tiket}`);
    const item = state.run.tickets.find((ticket) => ticket.nomor_tiket === row.nomor_tiket);
    try {
      const result = await client.scrapeDetail(row);
      let detail = result.detail;
      let screenshot = null;
      if (includeScreenshot) {
        const screenshotPath = path.join(config.outputDir, 'evidence', `${row.nomor_tiket}.png`);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await client.page.screenshot({ path: screenshotPath, fullPage: true }).catch((screenshotError) => addLog(`Screenshot ${row.nomor_tiket} gagal: ${screenshotError.message}`, 'warn'));
        screenshot = screenshotPath;
        if (screenshot) state.evidence[row.nomor_tiket] = screenshot;
      }
      const changeNumber = [row.values?.change_request, result.detail.change_request]
        .find((value) => /^CHG\d+$/i.test(String(value || '').trim()));
      if (changeNumber) {
        let changeData = { picRequester: '-', entity: '-', serviceOffering: '-' };
        try {
          changeData = await client.scrapeChangeRequest(changeNumber);
        } catch (err) {
          addLog(`Detail CHG ${changeNumber} gagal diambil: ${err.message}`, 'warn');
        }
        detail = {
          ...result.detail,
          requestor: firstUseful(changeData.picRequester, detail.requestor),
          location: firstUseful(changeData.entity, detail.location),
          application: firstUseful(changeData.serviceOffering, detail.application),
          // Popup PIC requester memakai camelCase; laporan memakai snake_case.
          contact: firstUseful(changeData.contact, detail.contact),
          email: firstUseful(changeData.email, detail.email),
          nipp_nrk: firstUseful(changeData.nippNrk, changeData.nipp_nrk, detail.nipp_nrk, detail.nipp, detail.nrk),
          change_data: changeData
        };
      }
      const validation = validateTicketData({ ...item, detail_tiket: detail });
      const validationErrors = [...validation.errors, ...validation.warnings.map((warning) => `Warning: ${warning}`)];
      upsertTicket(state.run, { ...item, detail_tiket: detail, activities: result.activities, activities_status: result.activities_status, activities_error: result.activities_error, scrape_status: 'success', errors: validationErrors, validation_status: validation.valid ? (validation.warnings.length ? 'warning' : 'valid') : 'invalid' });
      if (validationErrors.length) addLog(`${row.nomor_tiket} memiliki catatan validasi: ${validationErrors.join('; ')}`, 'warn');
      addLog(`${row.nomor_tiket} berhasil`);
    } catch (err) {
      upsertTicket(state.run, { ...item, scrape_status: 'failed', activities_status: 'error', activities_error: err.message, errors: [err.message] });
      addLog(`${row.nomor_tiket} gagal: ${err.message}`, 'error');
      warn('Gagal memproses tiket; melanjutkan tiket berikutnya', { ticket: row.nomor_tiket, message: err.message });
    }
    state.job.processed += 1;
    await saveRun(state.run, state.runFile);
    await client.restoreList();
  }
  if (state.job.status !== 'cancelled') state.job.status = 'completed';
  state.job.current = ''; state.job.message = state.job.status === 'completed' ? 'Scraping selesai' : 'Scraping dibatalkan';
  await saveRun(state.run, state.runFile);
}

app.get('/api/state', (_req, res) => res.json(publicState()));
app.post('/api/session/start', async (_req, res) => {
  try { await ensureClient(); res.json({ ok: true, state: publicState() }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/login', async (req, res) => {
  try { const client = await ensureClient(); const result = await client.login({ manual: req.body?.manual !== false }); res.json({ ok: true, ...result }); }
  catch (err) { error('Login gagal', { message: err.message }); res.status(500).json({ error: err.message }); }
});
app.post('/api/filters/refresh', async (_req, res) => {
  try {
    const client = await ensureClient();
    state.filters = await client.openFilters();
    info('Daftar filter dikirim ke frontend', { count: state.filters.length, filters: state.filters.map((filter) => filter.name) });
    res.json({ filters: state.filters });
  } catch (err) { addLog(err.message, 'error'); res.status(500).json({ error: err.message, filters: [] }); }
});
app.get('/api/filters', (_req, res) => res.json({ filters: state.filters, selected: state.selectedFilter }));
app.post('/api/filters/select', async (req, res) => {
  try { const name = String(req.body?.name || '').trim(); if (!name) throw new Error('Nama filter wajib diisi'); const client = await ensureClient(); const page = await client.selectFilter(name); state.selectedFilter = name; state.estimate = page.total || page.tickets.length; res.json({ ok: true, estimate: state.estimate }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get('/api/estimate', async (_req, res) => {
  try { const page = await (await ensureClient()).estimate(); state.estimate = page.total || page.tickets.length; res.json({ estimate: state.estimate }); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/scrape', async (req, res) => {
  if (state.job.status === 'running' || state.job.status === 'reading' || state.job.status === 'paused') return res.status(409).json({ error: 'Scraping sedang berjalan' });
  if (!state.selectedFilter) return res.status(400).json({ error: 'Pilih filter terlebih dahulu' });
  state.job = { status: 'starting', current: '', message: '', processed: 0, total: 0, logs: [] };
  runScrape(req.body || {}).catch((err) => { state.job.status = 'error'; state.job.message = err.message; addLog(err.message, 'error'); error('Scraping berhenti karena error', { message: err.message }); });
  res.json({ ok: true });
});
app.post('/api/scrape/:action', (req, res) => {
  const { action } = req.params;
  if (action === 'pause' && ['running', 'reading'].includes(state.job.status)) { state.job.status = 'paused'; addLog('Scraping dijeda'); }
  else if (action === 'resume' && state.job.status === 'paused') { state.job.status = 'running'; state.job.resume?.(); delete state.job.resume; addLog('Scraping dilanjutkan'); }
  else if (action === 'cancel' && !['idle', 'completed', 'error', 'cancelled'].includes(state.job.status)) { state.job.status = 'cancelled'; state.job.resume?.(); delete state.job.resume; addLog('Scraping dibatalkan', 'warn'); }
  else return res.status(400).json({ error: `Aksi ${action} tidak tersedia pada status ${state.job.status}` });
  res.json({ ok: true, status: state.job.status });
});
app.get('/api/results', (_req, res) => res.json(state.run || { metadata: {}, tickets: [] }));
app.get('/api/export/json', async (_req, res) => {
  if (!state.run) return res.status(404).json({ error: 'Belum ada hasil' });
  const file = path.join(config.outputDir, `${safeName(state.run.metadata?.filter_name || state.selectedFilter)}-result.json`); await saveRun(state.run, file); res.download(file, path.basename(file));
});
app.post('/api/upload-evidence', async (req, res) => {
  try {
    const dataUrl = String(req.body?.dataUrl || ''); const ticketNumbers = Array.isArray(req.body?.ticketNumbers) ? req.body.ticketNumbers : [];
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !ticketNumbers.length) throw new Error('Gambar dan tiket wajib dipilih');
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1]; const buffer = Buffer.from(match[2], 'base64');
    await fs.mkdir(path.join(config.outputDir, 'evidence'), { recursive: true });
    for (const number of ticketNumbers) { const file = path.join(config.outputDir, 'evidence', `${number}.${extension}`); await fs.writeFile(file, buffer); state.evidence[number] = file; }
    res.json({ ok: true, uploaded: ticketNumbers.length });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
function exportGuard() {
  if (BUSY_STATUSES.includes(state.job.status)) return 'Scraping sedang berjalan. Tunggu hingga selesai sebelum melakukan export.';
  if (!state.run) return 'Belum ada hasil scraping. Jalankan scraping terlebih dahulu.';
  if (!successfulTickets().length) return 'Belum ada tiket berhasil diproses pada hasil scraping ini.';
  return '';
}

function exportOverrides(tickets, defaultResult) {
  const allowed = ['Success', 'Warning', 'Error', 'Other'];
  const overrides = {};
  if (!allowed.includes(defaultResult)) return overrides;
  tickets.forEach((ticket) => {
    const hasResult = ticket.detail_tiket?.result || ticket.report?.result;
    if (!hasResult) overrides[ticket.nomor_tiket] = { result: defaultResult };
  });
  return overrides;
}

async function createPdfResponse(req, res, disposition = 'attachment') {
  const blocked = exportGuard();
  if (blocked) return res.status(BUSY_STATUSES.includes(state.job.status) ? 409 : 400).json({ error: blocked });
  const input = req.body || req.query || {};
  const tickets = successfulTickets();
  const file = path.join(config.outputDir, `${safeName(state.run.metadata?.filter_name || state.selectedFilter)}-report.pdf`);
  await generatePdf({ ...state.run, tickets }, file, {
    period: input.period || state.run.metadata?.filter_name,
    overrides: exportOverrides(tickets, input.resultDefault),
    screenshots: state.evidence
  });
  res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(file)}"`); return res.sendFile(file);
}
app.post('/api/export/pdf', async (req, res) => {
  try { await createPdfResponse(req, res); }
  catch (err) { error('Ekspor PDF gagal', { message: err.message }); res.status(500).json({ error: err.message }); }
});
app.post('/api/export/pdf-preview', async (req, res) => { try { await createPdfResponse(req, res, 'inline'); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/export/pdf-preview', async (req, res) => { try { await createPdfResponse(req, res, 'inline'); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/export/excel', async (req, res) => {
  try {
    const blocked = exportGuard();
    if (blocked) return res.status(BUSY_STATUSES.includes(state.job.status) ? 409 : 400).json({ error: blocked });
    const tickets = successfulTickets();
    const file = path.join(config.outputDir, `${safeName(state.run.metadata?.filter_name || state.selectedFilter)}-report.xlsx`);
    await generateExcel({ ...state.run, tickets }, file, {
      tickets,
      period: req.query.period || state.run.metadata?.filter_name,
      defaultResult: req.query.resultDefault
    });
    res.download(file, path.basename(file));
  } catch (err) { error('Ekspor Excel gagal', { message: err.message }); res.status(500).json({ error: err.message }); }
});
app.get('/api/requests', async (_req, res) => {
  try {
    const client = await ensureClient();
    const snapshot = await client.readChangeRequestList();
    res.json({ ok: true, tickets: snapshot.tickets, total: snapshot.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/requests/all', async (_req, res) => {
  try {
    const client = await ensureClient();
    const result = await client.readAllChangeRequests({ maxPages: 100 });
    res.json({ ok: true, tickets: result.tickets, pages: result.pages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/requests/:number/detail', async (req, res) => {
  try {
    const client = await ensureClient();
    const detail = await client.scrapeChangeRequestDetail({ nomor_tiket: req.params.number });
    res.json({ ok: true, detail: detail.detail, activities: detail.activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/requests/:number/summary', async (req, res) => {
  try {
    const { number } = req.params;
    const cached = state.aiSummaries.get(number);
    if (cached) return res.json({ ok: true, data: cached });
    const client = await ensureClient();
    const snapshot = await client.readChangeRequestList();
    const ticket = snapshot.tickets.find((t) => t.nomor_tiket === number);
    if (!ticket) return res.status(404).json({ error: 'Change Request tidak ditemukan' });
    const detail = await client.scrapeChangeRequestDetail(ticket);
    const result = await summarizeTicket({
      description: String(detail.detail.deskripsi_permasalahan || ''),
      assignedTo: String(detail.detail.ditugaskan_kepada || detail.detail.pic || ''),
      changeRequest: number,
    });
    state.aiSummaries.set(number, result);
    res.json({ ok: true, data: result });
  } catch (err) {
    error('AI Summary Change Request gagal', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tickets/:number/summary', async (req, res) => {
  try {
    const { number } = req.params;
    const cached = state.aiSummaries.get(number);
    if (cached) return res.json({ ok: true, data: cached });
    const ticket = state.run?.tickets.find((t) => t.nomor_tiket === number);
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    const detail = ticket.detail_tiket || {};
    const result = await summarizeTicket({
      description: String(detail.deskripsi_permasalahan || ticket.data_tabel?.deskripsi_permasalahan || ''),
      assignedTo: String(detail.ditugaskan_kepada || detail.pic || ''),
      changeRequest: String(ticket.data_tabel?.change_request || ''),
    });
    state.aiSummaries.set(number, result);
    res.json({ ok: true, data: result });
  } catch (err) {
    error('AI Summary gagal', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/analyze-risk', async (req, res) => {
  try {
    const { description, assignedTo, changeRequest, category } = req.body || {};
    if (!description) return res.status(400).json({ error: 'description diperlukan' });
    const result = await analyzeRisk({ description, assignedTo, changeRequest, category });
    res.json({ ok: true, data: result });
  } catch (err) {
    error('AI Risk Analysis gagal', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/detect-duplicates', async (req, res) => {
  try {
    const { targetTicket, historicalTickets } = req.body || {};
    if (!targetTicket) return res.status(400).json({ error: 'targetTicket diperlukan' });

    // shortcut: jika historicalTickets tidak dikirim, ambil dari tiket run aktif yang bukan target.
    let history = historicalTickets;
    if (!history || !Array.isArray(history) || history.length === 0) {
      const allTickets = state.run?.tickets || [];
      const targetNo = targetTicket.number || targetTicket.nomor_tiket;
      history = allTickets
        .filter((t) => t.nomor_tiket !== targetNo && t.scrape_status === 'success')
        .map((t) => ({
          number: t.nomor_tiket,
          short_description: t.detail_tiket?.deskripsi_singkat || t.data_tabel?.deskripsi_singkat || t.data_tabel?.short_description || '',
          configuration_item: t.detail_tiket?.configuration_item || t.data_tabel?.configuration_item || '',
          application: t.detail_tiket?.application || t.data_tabel?.application || '',
          description: t.detail_tiket?.deskripsi_permasalahan || t.data_tabel?.deskripsi_permasalahan || '',
          state: t.detail_tiket?.status?.nama || t.data_tabel?.state || 'Closed',
          created_at: t.detail_tiket?.start_date || t.data_tabel?.start_date || '',
        }));
    }

    const result = await detectDuplicates(targetTicket, history);
    res.json({ ok: true, data: result });
  } catch (err) {
    error('AI Duplicate Detection gagal', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});
app.get('*', (_req, res) => res.sendFile(path.join(root, '..', 'public', 'index.html')));

if (process.env.NO_SERVER !== 'true') {
  if (process.env.NODE_ENV !== 'test') printBanner();
  app.listen(config.port, () => info(`Aplikasi berjalan di http://localhost:${config.port}`));
}
export { app, state, runScrape };
