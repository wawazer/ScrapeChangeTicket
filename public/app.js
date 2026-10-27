const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let currentState = { tickets: [] };
let selected = new Set();
let activeView = 'dashboard';
let lastHistoryKey = '';
let ticketPage = 1;
let ticketPageSize = 8;

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
  setText('#logs', (job.logs || []).map((entry) => `[${new Date(entry.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${entry.message}`).join('\n') || 'Belum ada log.');
  renderTickets();
  renderSelectedTickets();
  renderHistory();
  if (state.run) saveHistory(state.run, job);
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
    return `<tr data-preview-ticket="${number}"><td><input type="checkbox" data-ticket="${number}" ${selected.has(ticket.nomor_tiket) ? 'checked' : ''} aria-label="Pilih ${number}"></td><td><button class="table-link" type="button" data-open-ticket="${number}">${number}</button></td><td>${escapeHtml(tableValue(ticket, 'created'))}</td><td>${escapeHtml(tableValue(ticket, 'change_request'))}</td><td class="description-cell">${escapeHtml(String(description).slice(0, 90))}</td><td>${escapeHtml(assigned)}</td><td><span class="status-badge status-neutral">${escapeHtml(detailStatus)}</span></td><td><span class="status-badge ${statusClass(scrape)}">${escapeHtml(statusLabel(scrape))}</span>${ticket.errors?.length ? '<small class="validation-note">Ada catatan</small>' : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="8" class="empty-cell">Tidak ada tiket yang cocok. Periksa pencarian atau jalankan scraping.</td></tr>';
  $$('[data-ticket]', body).forEach((checkbox) => checkbox.addEventListener('change', (event) => { const number = event.target.dataset.ticket; if (event.target.checked) selected.add(number); else selected.delete(number); renderSelectedTickets(); }));
  $$('[data-open-ticket]', body).forEach((button) => button.addEventListener('click', () => openTicket(button.dataset.openTicket)));
}

function renderSelectedTickets() {
  const box = $('#selectedTickets');
  if (!box) return;
  const tickets = currentState.tickets.filter((ticket) => selected.has(ticket.nomor_tiket));
  box.innerHTML = tickets.length ? tickets.map((ticket) => `<div class="selected-ticket"><span>${escapeHtml(ticket.nomor_tiket)}</span><button type="button" data-remove-ticket="${escapeHtml(ticket.nomor_tiket)}" aria-label="Hapus ${escapeHtml(ticket.nomor_tiket)}">×</button></div>`).join('') : '<p class="empty-copy">Belum ada tiket dipilih.</p>';
  $$('[data-remove-ticket]', box).forEach((button) => button.addEventListener('click', () => { selected.delete(button.dataset.removeTicket); renderTickets(); renderSelectedTickets(); }));
  setText('#reportMessage', tickets.length ? `${tickets.length} tiket siap diekspor.` : 'Belum ada tiket yang dipilih.');
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
const selectedTickets = () => [...selected];
const exportBody = () => JSON.stringify({ ticketNumbers: selectedTickets(), period: $('#period').value });
$('#pdfExport')?.addEventListener('click', async () => { const response = await fetch('/api/export/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: exportBody() }); if (!response.ok) { const data = await response.json(); announce(data.error || 'Ekspor PDF gagal', 'error'); return; } const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'laporan-patch-release.pdf'; link.click(); URL.revokeObjectURL(link.href); announce('PDF berhasil dibuat.'); });
$('#previewPdf')?.addEventListener('click', () => { const params = new URLSearchParams({ period: $('#period').value }); const numbers = selectedTickets(); if (numbers.length) params.set('ticketNumbers', numbers.join(',')); window.open(`/api/export/pdf-preview?${params}`, '_blank', 'noopener'); });
$('#uploadEvidence')?.addEventListener('click', () => { const file = $('#evidence').files[0]; if (!file) { announce('Pilih gambar bukti terlebih dahulu.', 'error'); return; } if (!selectedTickets().length) { announce('Pilih minimal satu tiket untuk bukti perubahan.', 'error'); return; } const reader = new FileReader(); reader.onload = async () => { try { await request('/api/upload-evidence', { method: 'POST', body: JSON.stringify({ dataUrl: reader.result, ticketNumbers: selectedTickets() }) }); announce('Bukti perubahan tersimpan.'); } catch (error) { announce(error.message, 'error'); } }; reader.readAsDataURL(file); });
$('#closePreview')?.addEventListener('click', () => $('#ticketPreview').close());
$('#ticketPreview')?.addEventListener('click', (event) => { if (event.target === $('#ticketPreview')) $('#ticketPreview').close(); });
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'dashboard'));
showView(location.hash.slice(1) || 'dashboard');
setInterval(refresh, 1000);
refresh();
