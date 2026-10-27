import { chromium } from 'playwright';
import { config } from './config.js';
import { info, warn } from './logger.js';
import { retry, ticketNumber } from './utils.js';
import { deduplicateTickets, parseActivities, parseDetailFields, parseTableRows } from './parsers.js';

export const SELECTORS = {
  frame: 'gsft_main', menu: 'Change - My Change Task', control: '#change_task_control_button',
  filterMenu: 'div[item_id="b17a69630a0a0bbb00f2601a9fa1e2da"]', filterItem: 'div.context_item', ticket: 'a.linked.formlink'
};

export class ServiceNowClient {
  constructor(options = {}) {
    this.options = { ...config, ...options };
    this.browser = null; this.context = null; this.page = null; this.listUrl = '';
  }

  async launch() {
    if (this.browser) return this.page;
    this.browser = await chromium.launch({ headless: this.options.headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    this.page.on('pageerror', (e) => warn('Kesalahan JavaScript halaman', { message: e.message }));
    info('Browser ServiceNow dibuka', { headless: this.options.headless });
    return this.page;
  }

  async close() { if (this.browser) await this.browser.close(); this.browser = null; this.page = null; }

  async frame() {
    if (!this.page) throw new Error('Browser belum dibuka');
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return this.page.frames().find((frame) => frame.name() === SELECTORS.frame) || this.page.mainFrame();
  }

  async login({ username = this.options.username, password = this.options.password, manual = false } = {}) {
    await this.launch();
    info('Membuka halaman login ServiceNow');
    await this.page.goto(this.options.loginUrl, { waitUntil: 'domcontentloaded' });
    if (username && password) {
      const user = this.page.locator('input[name="user_name"], input[name="username"], input[type="email"], #user_name').first();
      const pass = this.page.locator('input[name="user_password"], input[name="password"], input[type="password"]').first();
      if (await user.count() && await pass.count()) {
        await user.fill(username); await pass.fill(password);
        await this.page.locator('button[type="submit"], input[type="submit"], #login_button').first().click();
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      } else warn('Form login otomatis tidak ditemukan; browser tetap terbuka untuk login manual');
    } else if (manual) info('Kredensial kosong; silakan selesaikan login manual pada browser');
    await this.page.waitForTimeout(500);
    const loggedIn = await this.isLoggedIn();
    info(loggedIn ? 'Login ServiceNow terdeteksi' : 'Login belum terdeteksi');
    return { loggedIn, url: this.page.url() };
  }

  async isLoggedIn() {
    const frame = await this.frame();
    const body = await frame.locator('body').innerText().catch(() => '');
    return Boolean(this.page.url().includes('service-now.com') && !/login|sign in/i.test(body.slice(0, 500)));
  }

  async openChangeTaskMenu() {
    const frame = await this.frame();
    info('Membuka menu Change - My Change Task');
    const target = frame.getByText(SELECTORS.menu, { exact: true }).first();
    if (await target.count()) await target.click();
    else {
      const fallback = frame.locator(`a:has-text("${SELECTORS.menu}"), [aria-label*="${SELECTORS.menu}"]`).first();
      if (!(await fallback.count())) throw new Error(`Menu "${SELECTORS.menu}" tidak ditemukan`);
      await fallback.click();
    }
    await this.page.waitForTimeout(500);
    this.listUrl = this.page.url();
    return this.frame();
  }

  async openFilters() {
    const frame = await this.frame();
    info('Membuka menu Filters');
    const control = frame.locator(SELECTORS.control).first();
    if (await control.count()) await control.click();
    const menu = frame.locator(SELECTORS.filterMenu).first();
    if (await menu.count()) await menu.click().catch(() => {});
    else {
      const fallback = frame.getByText(/Filters?/i).first();
      if (await fallback.count()) await fallback.click().catch(() => {});
    }
    await this.page.waitForTimeout(250);
    return this.listFilters();
  }

  async listFilters() {
    const frame = await this.frame();
    const items = await frame.locator(SELECTORS.filterItem).evaluateAll((nodes) => nodes.map((node) => ({
      name: (node.innerText || node.textContent || '').trim(), id: node.getAttribute('item_id') || node.dataset.filterId || '',
      href: node.querySelector('a')?.href || ''
    })).filter((item) => item.name));
    if (!items.length) warn('Filter tidak terdeteksi otomatis; gunakan browser terbuka untuk diagnosis/manual selection');
    return items;
  }

  async selectFilter(name) {
    const frame = await this.frame();
    const item = frame.locator(SELECTORS.filterItem).filter({ hasText: name }).first();
    if (!(await item.count())) throw new Error(`Filter "${name}" tidak ditemukan di DOM ServiceNow`);
    await item.click(); await this.page.waitForTimeout(700);
    this.listUrl = this.page.url();
    info('Filter dipilih', { filter: name });
    return this.readTablePage();
  }

  async readTablePage() {
    const frame = await this.frame();
    const snapshot = await frame.locator('body').evaluate(() => {
      const tables = [...document.querySelectorAll('table')];
      const table = tables.find((candidate) => candidate.querySelector('a.linked.formlink')) || tables.find((candidate) => candidate.querySelector('tbody tr'));
      if (!table) return { headers: [], rows: [], signature: document.body.innerText.slice(0, 300), totalText: document.body.innerText };
      const headerNodes = [...table.querySelectorAll('thead th, tr:first-child th, tr:first-child td')];
      const headers = headerNodes.map((node) => node.innerText.trim() || node.getAttribute('aria-label') || node.dataset.field || '');
      const rowNodes = [...table.querySelectorAll('tbody tr')].filter((row) => row.querySelector('a.linked.formlink') || /CTASK\d+/i.test(row.innerText));
      const rows = rowNodes.map((row) => ({ text: row.innerText, cells: [...row.querySelectorAll('td')].map((cell) => ({ text: cell.innerText.trim(), field: cell.dataset.field || cell.getAttribute('data-column') || '', href: cell.querySelector('a.linked.formlink')?.href || '' })), href: row.querySelector('a.linked.formlink')?.href || '' }));
      const buttons = [...document.querySelectorAll('button, a, input')];
      const next = buttons.find((node) => /next|berikut/i.test(node.innerText || node.value || node.getAttribute('aria-label') || '') && !node.disabled);
      const previous = buttons.find((node) => /previous|prev|sebelum/i.test(node.innerText || node.value || node.getAttribute('aria-label') || '') && !node.disabled);
      return { headers, rows, signature: `${rows.map((row) => row.text).join('|')}|${document.body.innerText.slice(-200)}`, totalText: document.body.innerText, next: next ? { text: next.innerText || next.value, selector: next.id ? `#${next.id}` : '' } : null, previous: previous ? { text: previous.innerText || previous.value, selector: previous.id ? `#${previous.id}` : '' } : null };
    });
    const parsed = parseTableRows(snapshot);
    const totalMatch = snapshot.totalText.match(/(?:of|dari|total)\s+(\d[\d,.]*)/i);
    return { ...snapshot, tickets: deduplicateTickets(parsed), total: totalMatch ? Number(totalMatch[1].replace(/[,.]/g, '')) : parsed.length };
  }

  async estimate() { return this.readTablePage(); }

  async goToFirstPage({ maxPages = 100 } = {}) {
    const seen = new Set();
    for (let index = 0; index < maxPages; index += 1) {
      const page = await this.readTablePage();
      if (!page.previous || seen.has(page.signature)) return page;
      seen.add(page.signature);
      const frame = await this.frame();
      const previous = frame.locator(page.previous.selector || 'button, a, input').filter({ hasText: /previous|prev|sebelum/i }).first();
      if (!(await previous.count())) return page;
      await previous.click();
      await this.page.waitForTimeout(300);
    }
    return this.readTablePage();
  }

  async readAllTickets({ maxPages = 100 } = {}) {
    await this.goToFirstPage();
    const result = []; const seenSignatures = new Set(); let pageCount = 0;
    while (pageCount < maxPages) {
      const page = await this.readTablePage(); pageCount += 1;
      if (seenSignatures.has(page.signature)) { pageCount -= 1; break; }
      seenSignatures.add(page.signature);
      result.push(...page.tickets);
      if (!page.next) break;
      const frame = await this.frame();
      const next = frame.locator(page.next.selector || 'button, a, input').filter({ hasText: /next|berikut/i }).first();
      if (!(await next.count())) break;
      await next.click();
      await this.page.waitForFunction((signature) => document.body.innerText.slice(0, 2000) !== signature, page.signature.slice(0, 2000), { timeout: 10000 }).catch(() => {});
    }
    const unique = deduplicateTickets(result);
    info('Seluruh halaman tabel selesai dibaca', { pages: pageCount, tickets: unique.length });
    return { tickets: unique, pages: pageCount };
  }

  async restoreList() {
    if (this.listUrl && this.page.url() !== this.listUrl) await this.page.goto(this.listUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  async readActivities(frame) {
    let lastCount = -1;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const count = await frame.locator('.activity, .sn-stream-entry, [data-activity], .timeline-item, .activity-stream').count();
      const more = frame.getByText(/show more|load more|tampilkan lebih/i).first();
      if (await more.count() && await more.isVisible().catch(() => false)) await more.click().catch(() => {});
      await frame.locator('body').evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await this.page.waitForTimeout(150);
      if (count === lastCount && !(await more.count())) break;
      lastCount = count;
    }
    return frame.locator('.activity, .sn-stream-entry, [data-activity], .timeline-item, .activity-stream').evaluateAll((nodes) => nodes.map((node) => ({ text: node.innerText, timestamp: node.querySelector('time, .timestamp, .date')?.innerText, user: node.querySelector('.user, .author, .created-by')?.innerText, type: node.dataset.activityType || node.querySelector('.type')?.innerText, content: node.querySelector('.content, .body, .comment, .work-notes')?.innerText || node.innerText })));
  }

  async openTicket(row) {
    const frame = await this.frame();
    if (row.href) { await this.page.goto(new URL(row.href, this.options.baseUrl).href, { waitUntil: 'domcontentloaded' }); return; }
    const link = frame.locator(SELECTORS.ticket).filter({ hasText: row.nomor_tiket }).first();
    if (!(await link.count())) throw new Error(`Link tiket ${row.nomor_tiket} tidak ditemukan`);
    await link.click(); await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async scrapeDetail(row) {
    info('Membuka detail tiket', { ticket: row.nomor_tiket });
    await retry(() => this.openTicket(row), this.options.maxRetries, (e) => warn('Retry membuka tiket', { ticket: row.nomor_tiket, message: e.message }));
    const frame = await this.frame();
    const snapshot = await frame.locator('body').evaluate(() => {
      const fields = {};
      const first = (selectors) => selectors.map((selector) => document.querySelector(selector)).find((node) => node);
      const valueOf = (selectors) => {
        const node = first(selectors);
        if (!node) return '';
        if (node.tagName === 'SELECT') return node.selectedOptions[0]?.textContent?.trim() || node.value || '';
        return (node.value ?? node.innerText ?? node.textContent ?? '').trim();
      };
      const displayValue = (field) => valueOf([
        `input[name="sys_display.change_task.${field}"]`,
        `input[id="sys_display.change_task.${field}"]`,
        `input[name="${field}"][data-displayvalue]`,
        `input[name="${field}"]`
      ]);
      const setCanonical = (field, value) => { if (value) fields[field] = value; };
      for (const element of document.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
        const group = element.closest('.form-group, .form-field, .sn-form-row, .field, td') || element.parentElement;
        const label = group?.querySelector('label, .label, th')?.innerText || element.getAttribute('aria-label') || element.getAttribute('name') || element.id || '';
        let value = element.value ?? element.innerText ?? '';
        if (element.tagName === 'SELECT') value = element.selectedOptions[0]?.textContent?.trim() || value;
        fields[label.trim()] = value;
        if (/description|deskripsi/i.test(label)) fields.description_html = element.innerHTML || value;
      }
      setCanonical('change_request', displayValue('change_request'));
      setCanonical('ditugaskan_kepada', displayValue('assigned_to'));
      setCanonical('pic', displayValue('assigned_to') || displayValue('u_pic') || displayValue('pic'));
      setCanonical('kelompok_yang_ditugaskan', displayValue('assignment_group'));
      setCanonical('configuration_item', displayValue('cmdb_ci'));
      setCanonical('created', valueOf(['input[name="change_task.opened_at"]', 'input[name="change_task.sys_created_on"]', 'input[name="opened_at"]']));
      setCanonical('requestor', displayValue('requested_by') || displayValue('requestor'));
      setCanonical('nipp_nrk', valueOf(['input[name="change_task.u_nipp_nrk"]', 'input[name="u_nipp_nrk"]', 'input[name="nipp_nrk"]']));
      setCanonical('contact', valueOf(['input[name="change_task.u_contact"]', 'input[name="u_contact"]', 'input[name="contact"]']));
      setCanonical('email', valueOf(['input[name="change_task.u_email"]', 'input[name="u_email"]', 'input[name="email"]']));
      setCanonical('location', displayValue('location') || valueOf(['input[name="change_task.location"]', 'input[name="location"]']));
      setCanonical('application', displayValue('application') || valueOf(['input[name="change_task.u_application"]', 'input[name="u_application"]']));
      setCanonical('ip_address_server', valueOf(['input[name="change_task.u_ip_address_server"]', 'input[name="u_ip_address_server"]', 'input[name="ip_address_server"]']));
      setCanonical('version', valueOf(['input[name="change_task.u_version"]', 'input[name="u_version"]', 'input[name="version"]']));
      setCanonical('directory', valueOf(['input[name="change_task.u_directory"]', 'input[name="u_directory"]', 'input[name="directory"]']));
      setCanonical('cause', valueOf(['textarea[name="change_task.u_cause"]', 'textarea[name="u_cause"]', 'textarea[name="cause"]']));
      setCanonical('action_plan', valueOf(['textarea[name="change_task.u_action_plan"]', 'textarea[name="u_action_plan"]', 'textarea[name="action_plan"]']));
      const description = first(['textarea[name="change_task.description"]', 'textarea[name="description"]', '[contenteditable="true"][name*="description"]', '[contenteditable="true"][id*="description"]']);
      const descriptionHtml = description?.innerHTML || description?.value || fields.description_html || '';
      const status = document.querySelector('select[name="change_task.state"]') || [...document.querySelectorAll('select')].find((node) => /state|status/i.test(node.name || node.id || node.closest('div')?.innerText || ''));
      const statusOptions = status ? Object.fromEntries([...status.options].map((option) => [option.value, option.textContent.trim()])) : {};
      const activities = [...document.querySelectorAll('.activity, .sn-stream-entry, [data-activity], .timeline-item, .activity-stream')].map((node) => ({ text: node.innerText, timestamp: node.querySelector('time, .timestamp, .date')?.innerText, user: node.querySelector('.user, .author, .created-by')?.innerText, type: node.dataset.activityType || node.querySelector('.type')?.innerText, content: node.querySelector('.content, .body, .comment, .work-notes')?.innerText || node.innerText }));
      const numberText = valueOf(['input[name="change_task.number"]', 'input[name="number"]', 'input[id="change_task.number"]']);
      const stateValue = status?.value || '';
      fields.status = { value: stateValue, text: status?.selectedOptions[0]?.textContent?.trim() || '' };
      return { fields, statusOptions, descriptionHtml, activities, numberText };
    });
    const detail = parseDetailFields(snapshot);
    const actualNumber = ticketNumber(snapshot.numberText);
    if (actualNumber && actualNumber !== row.nomor_tiket) throw new Error(`Validasi nomor tiket gagal: diharapkan ${row.nomor_tiket}, ditemukan ${actualNumber}`);
    detail.nomor_tiket = row.nomor_tiket;
    const activityItems = parseActivities(await this.readActivities(frame));
    info('Detail tiket selesai', { ticket: row.nomor_tiket, activities: activityItems.length });
    return { detail, activities: activityItems, activities_status: 'success', activities_error: null };
  }

  async diagnose(filePath = `diagnostics/servicenow-${Date.now()}.html`) {
    const frame = await this.frame(); const html = await frame.locator('html').evaluate((node) => node.outerHTML);
    const fs = await import('node:fs/promises'); await fs.mkdir('diagnostics', { recursive: true }); await fs.writeFile(filePath, html, 'utf8');
    warn('Snapshot DOM diagnostik disimpan', { file: filePath }); return filePath;
  }
}
