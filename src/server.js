import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { error, info, warn } from './logger.js';
import { ServiceNowClient } from './servicenow.js';
import { createRun, checkpointPath, saveRun, upsertTicket } from './store.js';
import { generatePdf } from './pdf.js';
import { validateTicketData } from './parsers.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(root, '..', 'public')));

const state = {
  client: null, filters: [], selectedFilter: '', estimate: 0, run: null, runFile: '',
  evidence: {},
  job: { status: 'idle', current: '', message: '', processed: 0, total: 0, logs: [] }
};

function addLog(message, level = 'info') {
  state.job.logs.push({ at: new Date().toISOString(), level, message });
  state.job.logs = state.job.logs.slice(-100);
}

function publicState() {
  return { ...state.job, selectedFilter: state.selectedFilter, estimate: state.estimate, run: state.run ? { metadata: state.run.metadata, tickets: state.run.tickets } : null, connected: Boolean(state.client?.page) };
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
      let screenshot = null;
      if (includeScreenshot) {
        const screenshotPath = path.join(config.outputDir, 'evidence', `${row.nomor_tiket}.png`);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await client.page.screenshot({ path: screenshotPath, fullPage: true }).catch((screenshotError) => addLog(`Screenshot ${row.nomor_tiket} gagal: ${screenshotError.message}`, 'warn'));
        screenshot = screenshotPath;
        if (screenshot) state.evidence[row.nomor_tiket] = screenshot;
      }
      const validation = validateTicketData({ ...item, detail_tiket: result.detail });
      const validationErrors = [...validation.errors, ...validation.warnings.map((warning) => `Warning: ${warning}`)];
      upsertTicket(state.run, { ...item, detail_tiket: result.detail, activities: result.activities, activities_status: result.activities_status, activities_error: result.activities_error, scrape_status: 'success', errors: validationErrors, validation_status: validation.valid ? (validation.warnings.length ? 'warning' : 'valid') : 'invalid' });
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
  try { const client = await ensureClient(); state.filters = await client.openFilters(); res.json({ filters: state.filters }); }
  catch (err) { addLog(err.message, 'error'); res.status(500).json({ error: err.message, filters: [] }); }
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
  const file = path.join(config.outputDir, `${state.selectedFilter || 'servicenow'}-result.json`); await saveRun(state.run, file); res.download(file, path.basename(file));
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
async function createPdfResponse(req, res, disposition = 'attachment') {
  if (!state.run) return res.status(404).json({ error: 'Belum ada hasil' });
  const input = req.body || req.query || {};
  const ticketNumbers = Array.isArray(input.ticketNumbers) ? input.ticketNumbers : (input.ticketNumbers ? String(input.ticketNumbers).split(',').filter(Boolean) : undefined);
  const file = path.join(config.outputDir, `${state.selectedFilter || 'servicenow'}-report.pdf`);
  await generatePdf(state.run, file, { ticketNumbers, period: input.period, overrides: input.overrides, screenshots: state.evidence });
  res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(file)}"`); return res.sendFile(file);
}
app.post('/api/export/pdf', async (req, res) => {
  try { await createPdfResponse(req, res); }
  catch (err) { error('Ekspor PDF gagal', { message: err.message }); res.status(500).json({ error: err.message }); }
});
app.post('/api/export/pdf-preview', async (req, res) => { try { await createPdfResponse(req, res, 'inline'); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/export/pdf-preview', async (req, res) => { try { await createPdfResponse(req, res, 'inline'); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('*', (_req, res) => res.sendFile(path.join(root, '..', 'public', 'index.html')));

if (process.env.NO_SERVER !== 'true') app.listen(config.port, () => info(`Aplikasi berjalan di http://localhost:${config.port}`));
export { app, state, runScrape };
