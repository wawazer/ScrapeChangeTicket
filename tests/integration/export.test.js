import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const { generatePdf } = await import('../../src/pdf.js');
const { generateExcel } = await import('../../src/excel.js');
const { createRun, upsertTicket } = await import('../../src/store.js');
const { config } = await import('../../src/config.js');

const root = path.resolve(import.meta.dirname, '../..');

function ticket(number, detail = {}, status = 'success') {
  return {
    nomor_tiket: number,
    data_tabel: { created: '30-09-2026 10:08:34', change_request: 'CHG0005654', judul_task: 'Development' },
    detail_tiket: { pic: 'Mohamad Romli', ditugaskan_kepada: 'Mohamad Romli', ...detail },
    activities: [], activities_status: 'success', scrape_status: status,
    errors: status === 'failed' ? ['detail timeout'] : [],
    report: { result: 'Other' }
  };
}

async function pdfText(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true, disableFontFace: true, standardFontDataUrl: pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/standard_fonts/')).href }).promise;
  const pages = []; const sizes = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
    sizes.push([Math.round(page.view[2] - page.view[0]), Math.round(page.view[3] - page.view[1])]);
  }
  return { pages, numPages: pdf.numPages, sizes };
}

test('a long ticket continues on additional pages without truncating its fields', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-long-'));
  const output = path.join(directory, 'long.pdf');
  const longDescription = Array.from({ length: 90 }, (_, index) => `Langkah verifikasi ${index + 1} pada server aplikasi produksi`).join(' ');
  const longCause = Array.from({ length: 40 }, (_, index) => `Penyebab ${index + 1} ditemukan pada log`).join(' ');
  const run = createRun('CTASK SEPTEMBER');
  upsertTicket(run, ticket('CTASK0016973', { deskripsi_permasalahan_text: longDescription, cause: longCause, action_plan: longCause }));
  await generatePdf(run, output, { period: 'September 2026' });
  const { pages, numPages, sizes } = await pdfText(output);
  assert.ok(numPages >= 2, `expected continuation pages, got ${numPages}`);
  const text = pages.join(' ');
  assert.match(text, /Langkah verifikasi 90/);
  assert.match(text, /Penyebab 40/);
  assert.match(text, /Lanjutan tiket CTASK0016973/);
  for (const size of sizes) assert.deepEqual(size, [612, 792]);
});

test('one oversized ticket does not stop the rest of the batch', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-batch-'));
  const output = path.join(directory, 'batch.pdf');
  const run = createRun('CTASK SEPTEMBER');
  upsertTicket(run, ticket('CTASK0016973', { deskripsi_permasalahan_text: 'Panjang '.repeat(1500) }));
  upsertTicket(run, ticket('CTASK0016974', { deskripsi_permasalahan_text: 'Normal ticket' }));
  await generatePdf(run, output, { period: 'September 2026' });
  const { pages } = await pdfText(output);
  const text = pages.join(' ');
  assert.match(text, /CTASK0016973/);
  assert.match(text, /CTASK0016974/);
  assert.match(text, /Normal ticket/);
});

test('tickets with empty fields still render a complete page', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-empty-'));
  const output = path.join(directory, 'empty.pdf');
  const run = createRun('CTASK SEPTEMBER');
  upsertTicket(run, ticket('CTASK0016975', { pic: '', requestor: '', contact: '', email: '', location: '', application: '', cause: '', action_plan: '' }));
  await generatePdf(run, output, { period: 'September 2026' });
  const { pages, numPages } = await pdfText(output);
  assert.equal(numPages, 1);
  assert.match(pages.join(' '), /CTASK0016975/);
});

test('Excel export contains the full column set, display values and a table filter', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-xlsx-'));
  const output = path.join(directory, 'report.xlsx');
  const run = createRun('CTASK SEPTEMBER');
  upsertTicket(run, ticket('CTASK0016976', {
    judul_task: 'Development', judul_permasalahan: 'Penyesuaian user draft', ditugaskan_kepada: 'Mohamad Romli',
    configuration_item: 'PICO (ICOFR)', tipe_task: 'Release', prioritas: '3', start_date: '29-09-2026 20:24:31',
    requestor: 'Budi', nipp_nrk: '12345', contact: '0811', email: 'budi@pelindo.co.id', location: 'Jakarta',
    application: 'ICOFR', ip_address_server: '10.0.0.1', version: '1.0', directory: '/app', cause: 'Penyebab', action_plan: 'Tindakan',
    deskripsi_permasalahan_text: 'Deskripsi lengkap'
  }));
  upsertTicket(run, ticket('CTASK0016977', {}, 'failed'));
  await generateExcel(run, output, { tickets: run.tickets.filter((item) => item.scrape_status === 'success'), period: 'September 2026' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(output);
  const sheet = workbook.getWorksheet('Patch Release');
  assert.ok(sheet);
  const headers = sheet.getRow(1).values.slice(1);
  assert.deepEqual(headers, ['Nomor Tiket', 'Created', 'Change Request', 'Judul Task', 'Judul Permasalahan', 'Assigned To', 'Configuration Item', 'Task Type', 'Status', 'Priority', 'Start Date', 'End Date', 'Requestor', 'NIPP/NRK', 'Contact', 'Email', 'Location', 'Application', 'Change', 'IP Address Server', 'Version', 'Directory', 'PIC', 'Description', 'Result', 'Cause', 'Action Plan']);
  assert.equal(sheet.rowCount, 2);
  const row = sheet.getRow(2);
  assert.equal(row.getCell(1).value, 'CTASK0016976');
  assert.equal(row.getCell(6).value, 'Mohamad Romli');
  assert.equal(row.getCell(16).value, 'budi@pelindo.co.id');
  assert.equal(row.getCell(25).value, 'Other');
  assert.ok(sheet.autoFilter, 'worksheet should expose a table filter');
  const info = workbook.getWorksheet('Info');
  assert.equal(info.getRow(2).getCell(2).value, 'CTASK SEPTEMBER');
});

test('export endpoints refuse before scraping, during scraping and use only the active run', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-api-'));
  const previousOutput = config.outputDir;
  config.outputDir = directory;
  process.env.NO_SERVER = 'true';
  const { app, state } = await import('../../src/server.js');
  const server = (await import('node:http')).createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    state.run = null;
    let response = await fetch(`${base}/api/export/pdf`, { method: 'POST' });
    assert.equal(response.status, 400);
    response = await fetch(`${base}/api/export/excel`);
    assert.equal(response.status, 400);

    const run = createRun('CTASK SEPTEMBER');
    upsertTicket(run, ticket('CTASK0016978'));
    upsertTicket(run, ticket('CTASK0016979', {}, 'failed'));
    state.run = run;
    state.selectedFilter = 'OTHER FILTER';
    state.job = { ...state.job, status: 'running' };
    response = await fetch(`${base}/api/export/pdf`, { method: 'POST' });
    assert.equal(response.status, 409);
    response = await fetch(`${base}/api/export/excel`);
    assert.equal(response.status, 409);

    state.job = { ...state.job, status: 'completed' };
    response = await fetch(`${base}/api/export/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /CTASK_SEPTEMBER-report\.pdf/);
    const pdfFile = path.join(directory, 'CTASK_SEPTEMBER-report.pdf');
    const pdf = await pdfText(pdfFile);
    assert.match(pdf.pages.join(' '), /CTASK0016978/);
    assert.doesNotMatch(pdf.pages.join(' '), /CTASK0016979/);

    response = await fetch(`${base}/api/export/excel`);
    assert.equal(response.status, 200);
    const xlsx = path.join(directory, 'CTASK_SEPTEMBER-report.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsx);
    const numbers = [];
    workbook.getWorksheet('Patch Release').eachRow((row, index) => { if (index > 1) numbers.push(row.getCell(1).value); });
    assert.deepEqual(numbers, ['CTASK0016978']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    config.outputDir = previousOutput;
  }
});

test('scraping merges parent Change Request fields into the saved CTASK detail', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-chg-'));
  const previousOutput = config.outputDir;
  const previousNoServer = process.env.NO_SERVER;
  config.outputDir = directory;
  process.env.NO_SERVER = 'true';
  const { state, runScrape } = await import('../../src/server.js');
  state.client = {
    async launch() {},
    async readAllTickets() {
      return { tickets: [{ nomor_tiket: 'CTASK0016980', values: { change_request: 'CHG0004562' } }] };
    },
    async scrapeDetail() {
      return { detail: { change_request: '' }, activities: [], activities_status: 'success', activities_error: null };
    },
    async scrapeChangeRequest(number) {
      assert.equal(number, 'CHG0004562');
      return { picRequester: 'CHG requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering' };
    },
    async restoreList() {}
  };
  state.selectedFilter = 'CTASK CHG test';
  state.job = { status: 'idle', current: '', message: '', processed: 0, total: 0, logs: [] };
  try {
    await runScrape();
    const detail = state.run.tickets[0].detail_tiket;
    assert.equal(detail.requestor, 'CHG requester');
    assert.equal(detail.location, 'Kantor Pusat');
    assert.equal(detail.application, 'Service Offering');
    assert.equal(detail.nipp_nrk, '-');
    assert.equal(detail.contact, '-');
    assert.equal(detail.email, '-');
    assert.deepEqual(detail.change_data, { picRequester: 'CHG requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering' });
  } finally {
    state.client = null;
    state.run = null;
    state.runFile = '';
    config.outputDir = previousOutput;
    if (previousNoServer === undefined) delete process.env.NO_SERVER;
    else process.env.NO_SERVER = previousNoServer;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('PDF and Excel exports display Change Request fields and dash fallbacks', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-chg-export-'));
  try {
    const run = createRun('CTASK CHG test');
    upsertTicket(run, ticket('CTASK0016981', {
      requestor: '', location: '', application: '',
      nipp_nrk: '', contact: '', email: '',
      change_data: { picRequester: 'CHG requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering' }
    }));

    const excelPath = path.join(directory, 'chg.xlsx');
    await generateExcel(run, excelPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    const row = workbook.getWorksheet('Patch Release').getRow(2);
    assert.deepEqual([13, 14, 15, 16, 17, 18].map((column) => row.getCell(column).value), [
      'CHG requester', '-', '-', '-', 'Kantor Pusat', 'Service Offering'
    ]);

    const pdfPath = path.join(directory, 'chg.pdf');
    await generatePdf(run, pdfPath);
    const text = (await pdfText(pdfPath)).pages.join(' ');
    assert.match(text, /CHG requester/);
    assert.match(text, /Kantor Pusat/);
    assert.match(text, /Service Offering/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
