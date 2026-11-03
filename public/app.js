const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let currentState = { tickets: [] };
let activeView = 'dashboard';
let lastHistoryKey = '';
let ticketPage = 1;
let ticketPageSize = 8;
let exportBusy = false;
let exportNotice = null;
let lastState = {};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const isSysId = (value) => /^[a-f0-9]{24,40}$/i.test(String(value ?? '').trim());
const value = (...values) => values.find((item) => item !== undefined && item !== null && String(item).trim() && !isSysId(item)) || 'Belum tersedia';
const statusLabel = (status) => ({ success: 'Berhasil', failed: 'Gagal', pending: 'Belum diproses', cancelled: 'Dibatalkan', running: 'Berjalan', reading: 'Membaca', completed: 'Selesai', idle: 'Idle', starting: 'Memulai', error: 'Error', paused: 'Dijeda' }[status] || status || 'Belum tersedia');
const statusClass = (status) => ['success', 'failed', 'pending', 'running', 'reading', 'completed', 'error', 'paused', 'cancelled'].includes(status) ? `status-${status}` : 'status-neutral';

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

function announce(message, level = 'info') {
  const text = $('#jobMessage');
  const runText = $('#jobMessageRun');
  if (text) text.textContent = message;
  if (runText) runText.textContent = message;
  const live = $('#liveStatus');
  if (live) live.textContent = message;
  if (level === 'error') {
    if (text) text.classList.add('is-error');
    if (runText) runText.classList.add('is-error');
  } else {
    if (text) text.classList.remove('is-error');
    if (runText) runText.classList.remove('is-error');
  }
}

function showView(view) {
  activeView = view;
  const names = { dashboard: 'Dashboard', scrape: 'Scraping tickets', history: 'Riwayat scraping', tickets: 'Data tickets', reports: 'Export reports', settings: 'Settings' };
  $$('.view').forEach((section) => {
    const visible = section.dataset.view === view;
    section.hidden = !visible;
    section.classList.toggle('is-visible', visible);
  });
  $$('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.viewLink === view));
  if ($('#pageCrumb')) $('#pageCrumb').textContent = names[view] || view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  renderTickets();
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function renderActivity(job) {
  const entries = job.logs || [];
  const feed = $('#activityFeed');
  if (!feed) return;
  feed.innerHTML = entries.length ? entries.slice(-6).reverse().map((entry) => `<div class="activity-item"><span class="activity-marker ${escapeHtml(entry.level || 'info')}"></span><div><p>${escapeHtml(entry.message)}</p><time>${escapeHtml(new Date(entry.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))}</time></div></div>`).join('') : '<p class="empty-copy">Belum ada aktivitas scraping.</p>';
}

function saveHistory(run, job) {
  if (!run?.metadata) return;
  const key = `${run.metadata.filter_name}:${run.metadata.scraped_at}`;
  if (key === lastHistoryKey) return;
  lastHistoryKey = key;
  const item = { key, at: run.metadata.scraped_at, filter: run.metadata.filter_name, total: run.metadata.total_found, success: run.metadata.success, failed: run.metadata.failed, processed: run.metadata.processed, status: job.status };
  const previous = JSON.parse(localStorage.getItem('scrape-history') || '[]').filter((entry) => entry.key !== key);
  localStorage.setItem('scrape-history', JSON.stringify([item, ...previous].slice(0, 20)));
}

function render(state) {
  lastState = state;
  currentState = state.run || { tickets: [] };
  const metadata = currentState.metadata || {};
  const job = state;
  const total = metadata.total_found ?? state.estimate ?? 0;
  const processed = metadata.processed ?? job.processed ?? 0;
  const success = metadata.success ?? 0;
  const failed = metadata.failed ?? 0;
  const pending = metadata.pending ?? Math.max(total - processed, 0);
  const percent = job.total ? Math.round((job.processed / job.total) * 100) : (job.status === 'completed' ? 100 : 0);
  const connected = Boolean(state.connected);
  setText('#connection', connected ? 'Browser terhubung' : 'Browser belum dibuka');
  setText('#connectionHint', connected ? 'Sesi ServiceNow siap digunakan' : 'Sesi ServiceNow belum aktif');
  setText('#sessionChip', connected ? 'Connected' : 'Offline');
  setText('#scrapeConnectionStatus', connected ? 'Browser ServiceNow terhubung.' : 'Sesi belum aktif.');
  setText('#settingsConnection', connected ? 'Browser terhubung' : 'Belum dibuka');
  $('#connectionDot')?.classList.toggle('is-online', connected);
  $('#sessionChip')?.classList.toggle('is-online', connected);
  setText('#total', total ? total.toLocaleString('id-ID') : 'Belum ada');
  setText('#success', success ? success.toLocaleString('id-ID') : 'Belum ada');
  setText('#failed', failed ? failed.toLocaleString('id-ID') : 'Belum ada');
  setText('#pending', pending ? pending.toLocaleString('id-ID') : 'Belum ada');
  setText('#totalContext', metadata.filter_name ? `Filter ${metadata.filter_name}` : 'Pilih filter ServiceNow');
  setText('#successContext', success ? `${success} tiket selesai` : 'Menunggu proses');
  setText('#failedContext', failed ? `${failed} tiket perlu diperiksa` : 'Tidak ada error');
  setText('#pendingContext', pending ? 'Masih dalam antrean' : 'Semua tiket selesai');
  setText('#activeFilter', state.selectedFilter || metadata.filter_name || 'Belum dipilih');
  setText('#settingsFilter', state.selectedFilter || metadata.filter_name || 'Belum dipilih');
  setText('#dashboardEstimate', state.estimate ? state.estimate.toLocaleString('id-ID') : 'Belum tersedia');
  setText('#estimate', state.estimate ? state.estimate.toLocaleString('id-ID') : 'Belum tersedia');
  setText('#dashboardProgress', job.total ? `${job.processed} dari ${job.total}` : statusLabel(job.status));
  setText('#progressText', job.total ? `${job.processed} dari ${job.total}` : 'Belum dimulai');
  setText('#currentTicket', job.current || 'Tidak ada tiket yang sedang diproses');
  setText('#runCurrent', job.current || 'Tidak ada');
  setText('#jobMessage', job.message || 'Siap menerima konfigurasi.');
  setText('#jobMessageRun', job.message || 'Siap menerima konfigurasi.');
  ['#dashboardJobStatus', '#jobStatus'].forEach((selector) => { const element = $(selector); if (element) { element.textContent = statusLabel(job.status); element.className = `status-badge ${statusClass(job.status)}`; } });
  ['#progressBar', '#progressBarRun'].forEach((selector) => { const bar = $(selector); if (bar) bar.style.transform = `scaleX(${percent / 100})`; });
  renderActivity(job);
  renderAnalytics(total, processed, success, failed, pending, percent);
  setText('#logs', (job.logs || []).map((entry) => `[${new Date(entry.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${entry.message}`).join('\n') || 'Belum ada log.');
  renderTickets();
  renderExport(state);
  renderHistory();
  if (state.run) saveHistory(state.run, job);
}

function renderAnalytics(total, processed, success, failed, pending, percent) {
  const successPct = total > 0 ? Math.round((success / total) * 100) : 0;
  const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.max(0, 100 - successPct - failedPct) : 100;

  const barSuccess = $('#distSuccess');
  const barFailed = $('#distFailed');
  const barPending = $('#distPending');
  if (barSuccess) barSuccess.style.width = `${successPct}%`;
  if (barFailed) barFailed.style.width = `${failedPct}%`;
  if (barPending) barPending.style.width = `${total > 0 ? pendingPct : 100}%`;

  setText('#distributionRate', `${percent}% Selesai`);
  setText('#legendSuccess', success.toLocaleString('id-ID'));
  setText('#legendFailed', failed.toLocaleString('id-ID'));
  setText('#legendPending', (total > 0 ? pending : 0).toLocaleString('id-ID'));

  const trendContainer = $('#trendBars');
  if (trendContainer) {
    const history = JSON.parse(localStorage.getItem('scrape-history') || '[]');
    if (history.length) {
      const recent = history.slice(0, 8).reverse();
      const maxTickets = Math.max(...recent.map((item) => item.total || item.processed || 1), 1);
      trendContainer.innerHTML = recent.map((item) => {
        const count = item.total || item.processed || 0;
        const heightPct = Math.max(12, Math.round((count / maxTickets) * 100));
        const successRate = count > 0 ? Math.round(((item.success || 0) / count) * 100) : 0;
        const barClass = (item.failed || 0) > 0 ? 'trend-bar-warn' : 'trend-bar-success';
        const dateStr = item.at ? new Date(item.at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-';
        return `<div class="trend-col" title="${escapeHtml(item.filter || 'Run')}: ${count} tiket (${successRate}% berhasil)"><div class="trend-bar-track"><div class="trend-bar-fill ${barClass}" style="height: ${heightPct}%"></div></div><span class="trend-label">${escapeHtml(dateStr)}</span></div>`;
      }).join('');
    } else {
      trendContainer.innerHTML = '<p class="empty-copy">Belum ada data riwayat untuk menampilkan grafik tren.</p>';
    }
  }
}

function tableValue(ticket, key, fallback = 'Belum tersedia') {
  const detail = ticket.detail_tiket || {};
  const table = ticket.data_tabel || {};
  return value(detail[key], table[key], fallback);
}

function ensureTicketPagination() {
  if ($('#ticketPagination')) return;
  const panel = $('.data-panel');
  if (!panel) return;
  const footer = document.createElement('div');
  footer.className = 'table-footer';
  footer.innerHTML = '<span id="paginationInfo" class="pagination-info">Halaman 1</span><div id="ticketPagination" class="pagination" aria-label="Pagination tiket"></div><label class="page-size"><span>Per halaman</span><select id="pageSize"><option value="8">8</option><option value="16">16</option><option value="32">32</option></select></label>';
  panel.append(footer);
  $('#pageSize').addEventListener('change', (event) => { ticketPageSize = Number(event.target.value) || 8; ticketPage = 1; renderTickets(); });
}

function renderPagination(totalPages) {
  const pagination = $('#ticketPagination');
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    setText('#paginationInfo', totalPages ? 'Semua tiket ditampilkan' : 'Belum ada halaman');
    return;
  }
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  pagination.innerHTML = `<button type="button" data-page="${ticketPage - 1}" aria-label="Halaman sebelumnya" ${ticketPage === 1 ? 'disabled' : ''}>‹</button>${pages.map((page) => `<button type="button" data-page="${page}" class="${page === ticketPage ? 'is-current' : ''}" aria-label="Halaman ${page}" ${page === ticketPage ? 'aria-current="page"' : ''}>${page}</button>`).join('')}<button type="button" data-page="${ticketPage + 1}" aria-label="Halaman berikutnya" ${ticketPage === totalPages ? 'disabled' : ''}>›</button>`;
  setText('#paginationInfo', `Halaman ${ticketPage} dari ${totalPages}`);
  $$('[data-page]', pagination).forEach((button) => button.addEventListener('click', () => {
    const nextPage = Number(button.dataset.page);
    if (nextPage >= 1 && nextPage <= totalPages) { ticketPage = nextPage; renderTickets(); }
  }));
}

function renderTickets() {
  const body = $('#ticketRows');
  if (!body) return;
  ensureTicketPagination();
  const query = ($('#search')?.value || '').toLowerCase().trim();
  const status = $('#statusFilter')?.value || '';
  const filteredTickets = (currentState.tickets || []).filter((ticket) => {
    const number = String(ticket.nomor_tiket || '').toLowerCase();
    const matchesQuery = !query || [number, tableValue(ticket, 'change_request'), tableValue(ticket, 'description'), tableValue(ticket, 'ditugaskan_kepada')].join(' ').toLowerCase().includes(query);
    return matchesQuery && (!status || ticket.scrape_status === status);
  });
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / ticketPageSize));
  ticketPage = Math.min(ticketPage, totalPages);
  const start = (ticketPage - 1) * ticketPageSize;
  const tickets = filteredTickets.slice(start, start + ticketPageSize);
  setText('#tableInfo', currentState.tickets?.length ? `${filteredTickets.length} dari ${currentState.tickets.length} tiket ditampilkan` : 'Belum ada data tiket.');
  renderPagination(filteredTickets.length ? totalPages : 0);
  body.innerHTML = tickets.length ? tickets.map((ticket) => {
    const number = escapeHtml(ticket.nomor_tiket);
    const scrape = ticket.scrape_status || 'pending';
    const detailStatus = ticket.detail_tiket?.status?.nama || ticket.detail_tiket?.status?.kode || 'Belum tersedia';
    const description = tableValue(ticket, 'deskripsi_permasalahan_text', tableValue(ticket, 'deskripsi_permasalahan', 'Belum tersedia'));
    const assigned = value(ticket.detail_tiket?.ditugaskan_kepada, ticket.detail_tiket?.pic, ticket.data_tabel?.ditugaskan_kepada);
    return `<tr data-preview-ticket="${number}"><td><button class="table-link" type="button" data-open-ticket="${number}">${number}</button></td><td>${escapeHtml(tableValue(ticket, 'created'))}</td><td>${escapeHtml(tableValue(ticket, 'change_request'))}</td><td class="description-cell">${escapeHtml(String(description).slice(0, 90))}</td><td>${escapeHtml(assigned)}</td><td><span class="status-badge status-neutral">${escapeHtml(detailStatus)}</span></td><td><span class="status-badge ${statusClass(scrape)}">${escapeHtml(statusLabel(scrape))}</span>${ticket.errors?.length ? '<small class="validation-note">Ada catatan</small>' : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">Tidak ada tiket yang cocok. Periksa pencarian atau jalankan scraping.</td></tr>';
  $$('[data-open-ticket]', body).forEach((button) => button.addEventListener('click', () => openTicket(button.dataset.openTicket)));
}

function renderExport(state, options = {}) {
  const info = state.export || {};
  const count = info.count || 0;
  const ready = Boolean(info.ready) && !exportBusy;
  setText('#exportFilter', info.filter || 'Belum ada hasil scraping');
  setText('#exportCount', count.toLocaleString('id-ID'));
  setText('#exportFailed', (info.failed || 0).toLocaleString('id-ID'));
  const pdf = $('#pdfExport'); const excel = $('#excelExport'); const preview = $('#previewPdf');
  if (pdf) { pdf.disabled = !ready; pdf.textContent = ready ? `Export PDF (${count} tiket)` : 'Export PDF'; }
  if (excel) { excel.disabled = !ready; excel.textContent = ready ? `Export Excel (${count} tiket)` : 'Export Excel'; }
  if (preview) preview.disabled = !ready;
  const period = $('#period');
  if (period && !period.value && info.filter) period.value = info.filter;
  if (exportBusy || options.keepMessage) return;
  const signature = `${info.filter || ''}|${count}|${Boolean(info.ready)}`;
  if (exportNotice && exportNotice.signature !== signature) exportNotice = null;
  if (exportNotice) { reportStatus(exportNotice.text, exportNotice.level); return; }
  const message = !info.ready ? (info.reason || 'Belum ada hasil scraping.') : `${count} tiket siap diekspor${info.failed ? `; ${info.failed} tiket gagal tidak disertakan` : ''}.`;
  reportStatus(message, info.ready ? 'info' : 'warning');
}

function reportStatus(message, level = 'info') {
  const box = $('#reportMessage');
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('is-error', level === 'error');
}

function exportFilename(extension) {
  const base = String(lastState.export?.filter || 'servicenow').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return `laporan-${base || 'servicenow'}.${extension}`;
}

async function downloadExport(url, options, filename) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Export gagal. Periksa log aplikasi.');
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(link.href);
  return blob.size;
}

async function runExport({ url, options, extension, label }) {
  if (exportBusy) return;
  exportBusy = true;
  const info = lastState.export || {};
  const signature = `${info.filter || ''}|${info.count || 0}|${Boolean(info.ready)}`;
  renderExport(lastState, { keepMessage: true });
  exportNotice = { text: `Membuat ${label} untuk ${info.count || 0} tiket…`, level: 'info', signature };
  reportStatus(exportNotice.text);
  try {
    const size = await downloadExport(url, options, exportFilename(extension));
    exportNotice.text = `${label} berhasil dibuat dan diunduh (${Math.max(1, Math.round(size / 1024)).toLocaleString('id-ID')} KB).`;
  } catch (error) {
    exportNotice = { ...exportNotice, text: error.message, level: 'error' };
  } finally {
    exportBusy = false;
    renderExport(lastState, { keepMessage: true });
    reportStatus(exportNotice.text, exportNotice.level);
  }
}

function renderHistory() {
  const body = $('#historyRows');
  if (!body) return;
  const items = JSON.parse(localStorage.getItem('scrape-history') || '[]');
  body.innerHTML = items.length ? items.map((item) => `<tr><td>${escapeHtml(new Date(item.at).toLocaleString('id-ID'))}</td><td>${escapeHtml(item.filter || 'Belum tersedia')}</td><td>${escapeHtml(String(item.total ?? 'Belum tersedia'))}</td><td>${escapeHtml(`${item.processed ?? 0} dari ${item.total ?? 0}`)}</td><td><span class="status-badge ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span><small>${escapeHtml(`${item.success ?? 0} berhasil, ${item.failed ?? 0} gagal`)}</small></td><td><button class="text-button" type="button" data-history-open="${escapeHtml(item.key)}">Buka data</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Belum ada riwayat run. Run baru akan muncul setelah data diterima.</td></tr>';
  $$('[data-history-open]', body).forEach((button) => button.addEventListener('click', () => showView('tickets')));
}

function sanitizeDescription(html, fallback) {
  if (!html) return `<p>${escapeHtml(fallback || 'Belum tersedia')}</p>`;
  const source = new DOMParser().parseFromString(html, 'text/html');
  source.querySelectorAll('script,style,iframe,object,embed').forEach((node) => node.remove());
  source.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('on')) node.removeAttribute(attribute.name);
      if (attribute.name === 'href' && !/^https?:\/\//i.test(attribute.value)) node.removeAttribute(attribute.name);
      if (!['href', 'target', 'rel'].includes(attribute.name) && node.tagName === 'A') node.removeAttribute(attribute.name);
    });
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  });
  return source.body.innerHTML || `<p>${escapeHtml(fallback || 'Belum tersedia')}</p>`;
}

function openTicket(number) {
  const ticket = currentState.tickets.find((item) => item.nomor_tiket === number);
  if (!ticket || !$('#ticketPreview')) return;
  const detail = ticket.detail_tiket || {};
  setText('#previewTitle', ticket.nomor_tiket);
  const validation = $('#detailValidation');
  if (validation) { validation.textContent = ticket.errors?.length ? 'Perlu diperiksa' : 'Data valid'; validation.className = `status-badge ${ticket.errors?.length ? 'status-failed' : 'status-success'}`; }
  const rows = [['Created', tableValue(ticket, 'created')], ['Change request', tableValue(ticket, 'change_request')], ['Requestor', detail.requestor], ['NIPP/NRK', detail.nipp_nrk], ['Contact', detail.contact], ['Email', detail.email], ['Location', detail.location], ['Application', detail.application], ['PIC', value(detail.pic, detail.ditugaskan_kepada)], ['Result', ticket.report?.result || 'Other'], ['Cause', detail.cause], ['Action Plan', detail.action_plan]];
  const activities = ticket.activities?.length ? `<section class="detail-section"><h3>Activities</h3><div class="activity-detail">${ticket.activities.map((activity) => `<article><time>${escapeHtml(activity.timestamp || 'Waktu tidak tersedia')}</time><strong>${escapeHtml(activity.user || activity.type || 'Activity')}</strong><p>${escapeHtml(activity.content || activity.comment || activity.work_notes || '')}</p></article>`).join('')}</div></section>` : '<section class="detail-section"><h3>Activities</h3><p class="empty-copy">Belum ada activity yang tersimpan.</p></section>';
  $('#detailContent').innerHTML = `<section class="detail-section"><h3>Identitas tiket</h3><dl class="detail-grid">${rows.map(([label, item]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value(item))}</dd></div>`).join('')}</dl></section><section class="detail-section"><h3>Description</h3><div class="rich-description">${sanitizeDescription(detail.deskripsi_permasalahan_html, detail.deskripsi_permasalahan_text)}</div></section>${activities}${ticket.errors?.length ? `<section class="detail-section detail-warning"><h3>Catatan validasi</h3><ul>${ticket.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></section>` : ''}`;
  $('#previewBody').textContent = JSON.stringify(ticket, null, 2);
  $('#ticketPreview').showModal();
}

async function refresh() {
  try { render(await request('/api/state')); } catch (error) { announce(error.message, 'error'); }
}

async function startBrowser() { try { await request('/api/session/start', { method: 'POST', body: '{}' }); announce('Browser ServiceNow dibuka.'); await refresh(); } catch (error) { announce(error.message, 'error'); } }
async function login() { try { const result = await request('/api/login', { method: 'POST', body: JSON.stringify({ manual: true }) }); announce(result.loggedIn ? 'Login ServiceNow terdeteksi.' : 'Selesaikan login pada browser ServiceNow.'); await refresh(); } catch (error) { announce(error.message, 'error'); } }

$$('[data-view-link]').forEach((element) => element.addEventListener('click', () => showView(element.dataset.viewLink)));
$$('#startBrowser, #startBrowserTop').forEach((button) => button.addEventListener('click', startBrowser));
$$('#login, #loginTop').forEach((button) => button.addEventListener('click', login));
$('#refreshFilters')?.addEventListener('click', async () => { try { const result = await request('/api/filters/refresh', { method: 'POST', body: '{}' }); $('#filterSelect').innerHTML = '<option value="">Pilih filter</option>' + result.filters.map((filter) => `<option value="${escapeHtml(filter.name)}">${escapeHtml(filter.name)}</option>`).join(''); announce(`${result.filters.length} filter ditemukan.`); await refresh(); } catch (error) { announce(error.message, 'error'); } });
$('#useCustom')?.addEventListener('click', () => { const filter = $('#customFilter').value.trim(); if (filter) { $('#filterSelect').innerHTML = `<option value="${escapeHtml(filter)}">${escapeHtml(filter)}</option>`; $('#filterSelect').value = filter; } });
$('#selectFilter')?.addEventListener('click', async () => { const name = $('#filterSelect').value || $('#customFilter').value.trim(); try { const result = await request('/api/filters/select', { method: 'POST', body: JSON.stringify({ name }) }); setText('#estimate', result.estimate ? result.estimate.toLocaleString('id-ID') : 'Belum tersedia'); announce(`Filter aktif: ${name}`); await refresh(); } catch (error) { announce(error.message, 'error'); } });
$('#startScrape')?.addEventListener('click', async () => { try { await request('/api/scrape', { method: 'POST', body: JSON.stringify({ limit: Number($('#limit').value) || 0, includeScreenshot: $('#includeScreenshot').checked }) }); announce('Scraping dimulai.'); await refresh(); } catch (error) { announce(error.message, 'error'); } });
for (const action of ['pause', 'resume', 'cancel']) $(`#${action}Scrape`)?.addEventListener('click', async () => { try { await request(`/api/scrape/${action}`, { method: 'POST', body: '{}' }); await refresh(); } catch (error) { announce(error.message, 'error'); } });
$('#search')?.addEventListener('input', () => { ticketPage = 1; renderTickets(); }); $('#statusFilter')?.addEventListener('change', () => { ticketPage = 1; renderTickets(); });
$('#pdfExport')?.addEventListener('click', () => runExport({
  url: '/api/export/pdf',
  options: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period: $('#period').value, resultDefault: $('#resultDefault').value }) },
  extension: 'pdf',
  label: 'PDF'
}));
$('#excelExport')?.addEventListener('click', () => {
  const params = new URLSearchParams({ period: $('#period').value || '', resultDefault: $('#resultDefault').value || '' });
  return runExport({ url: `/api/export/excel?${params}`, options: {}, extension: 'xlsx', label: 'Excel' });
});
$('#previewPdf')?.addEventListener('click', () => {
  const params = new URLSearchParams({ period: $('#period').value || '', resultDefault: $('#resultDefault').value || '' });
  window.open(`/api/export/pdf-preview?${params}`, '_blank', 'noopener');
});
$('#closePreview')?.addEventListener('click', () => $('#ticketPreview').close());
$('#ticketPreview')?.addEventListener('click', (event) => { if (event.target === $('#ticketPreview')) $('#ticketPreview').close(); });
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'dashboard'));
showView(location.hash.slice(1) || 'dashboard');
setInterval(refresh, 1000);
refresh();
