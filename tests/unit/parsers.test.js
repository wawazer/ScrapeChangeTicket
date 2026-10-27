import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deduplicateTickets, htmlToText, isSysId, makeMetadata, mapColumns, parseActivities, parseDetailFields, parseStatus, parseTableRows, reportTicket, validateExportData, validateTicketData } from '../../src/parsers.js';

test('maps columns by label and ignores reordered columns', () => {
  const mapping = mapColumns(['Selector', 'Tipe Task', 'Nomor Tiket', 'Judul Permasalahan', 'Status']);
  assert.deepEqual(mapping, { tipe_task: 1, nomor_tiket: 2, judul_permasalahan: 3, status: 4 });
});

test('parses all ticket rows and deduplicates pagination overlap', () => {
  const rows = parseTableRows({ headers: ['No. Tiket', 'Tipe Task', 'Created'], rows: [
    { cells: [{ text: 'CTASK0016976' }, { text: 'Release' }, { text: '01/09/2026' }], href: '/ticket?id=1' },
    { cells: [{ text: 'CTASK0016977' }, { text: 'Normal' }, { text: '02/09/2026' }] }
  ] });
  assert.equal(rows[0].nomor_tiket, 'CTASK0016976');
  assert.equal(deduplicateTickets([...rows, rows[0]]).length, 2);
});

test('maps detail fields without confusing task type and problem title', () => {
  const result = parseDetailFields({ fields: {
    'Nomor Tiket': 'CTASK0016976', 'Change Request': 'CHG0005654', 'Tipe Task': 'Release',
    'Judul Permasalahan': 'penyesuain user draft dengan pemaraf dengan orang yang sama',
    'Status': 'Closed', 'Kelompok yang Ditugaskan': 'Regional 3 - Application Support', 'PIC': 'Mohamad Romli'
  }, statusOptions: { '3': 'Closed' }, descriptionHtml: '<p>PIC: ALIF PRASETYO AJI</p><a href="https://git.example/commit/1">commit</a>' });
  assert.equal(result.tipe_task, 'Release');
  assert.equal(result.judul_permasalahan, 'penyesuain user draft dengan pemaraf dengan orang yang sama');
  assert.deepEqual(result.status, { kode: '3', nama: 'Closed' });
  assert.match(result.deskripsi_permasalahan_text, /PIC: ALIF/);
  assert.match(result.deskripsi_permasalahan_text, /https:\/\/git/);
});

test('parses activities and status values', () => {
  assert.deepEqual(parseStatus({ value: '3', text: 'Closed' }), { kode: '3', nama: 'Closed' });
  assert.equal(parseActivities([{ timestamp: 'today', user: 'A', type: 'work notes', content: 'done' }])[0].user, 'A');
});

test('creates metadata, validates output and prepares report fields', () => {
  const tickets = [{ nomor_tiket: 'CTASK1', scrape_status: 'success', errors: [], detail_tiket: { pic: 'A' }, data_tabel: {} }, { nomor_tiket: 'CTASK2', scrape_status: 'failed', errors: ['timeout'] }];
  const metadata = makeMetadata({ filterName: 'CTASK SEPTEMBER', tickets, totalFound: 2 });
  assert.equal(metadata.success, 1); assert.equal(metadata.failed, 1); assert.equal(metadata.filter_name, 'CTASK SEPTEMBER');
  assert.equal(validateExportData({ metadata, tickets }), true);
  assert.equal(reportTicket(tickets[0]).pic, 'A');
});

test('cleans HTML and preserves meaningful links', () => {
  assert.equal(htmlToText('<p>Hello<br>world</p><script>x</script>'), 'Hello\nworld');
});

test('keeps table data limited to mapped headers', () => {
  const [ticket] = parseTableRows({ headers: ['No. Tiket', 'Created', 'Ignored'], rows: [{ cells: [{ text: 'CTASK0001' }, { text: '01-09-2026' }, { text: 'text from an unmapped cell' }] }] });
  assert.deepEqual(ticket.values, { nomor_tiket: 'CTASK0001', created: '01-09-2026' });
  assert.equal(ticket.values.ignored, undefined);
});

test('uses the row ticket number when detail description contains HTML', () => {
  const detail = parseDetailFields({ fields: { 'Nomor Tiket': '<p>description</p>', 'Change Request': 'b960642693634710cbd5f6fa2bba1075' }, descriptionHtml: '<p>description</p>' });
  assert.equal(detail.nomor_tiket, '');
  const validation = validateTicketData({ nomor_tiket: 'CTASK0001', detail_tiket: { ...detail, nomor_tiket: '<p>description</p>' } });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('detail_tiket.nomor_tiket bukan nomor CTASK'));
});

test('prefers display values over sys_id values in report mapping', () => {
  const report = reportTicket({ nomor_tiket: 'CTASK0001', data_tabel: { change_request: 'CHG0005654', ditugaskan_kepada: 'Mohamad Romli', configuration_item: 'PICO (ICOFR)' }, detail_tiket: { change_request: 'b960642693634710cbd5f6fa2bba1075', ditugaskan_kepada: '2713c04e0f9b52006872c5ece1050e05', configuration_item: '5e3012cd932b6a90cbd5f6fa2bba1087' } });
  assert.equal(report.change, 'CHG0005654');
  assert.equal(report.pic, 'Mohamad Romli');
  assert.equal(report.application, '-');
  assert.equal(isSysId('b960642693634710cbd5f6fa2bba1075'), true);
});

test('converts a ServiceNow state code using the selected option label', () => {
  const detail = parseDetailFields({ fields: { status: { value: '3', text: '3' } }, statusOptions: { '3': 'Closed' } });
  assert.deepEqual(detail.status, { kode: '3', nama: 'Closed' });
});

test('actual twenty-ticket fixture preserves ticket identity and display mappings', async () => {
  const source = JSON.parse(await fs.readFile(path.join(import.meta.dirname, '../fixtures/actual-servicenow-result.json'), 'utf8'));
  const expected = JSON.parse(await fs.readFile(path.join(import.meta.dirname, '../fixtures/actual-servicenow-expected.json'), 'utf8'));
  assert.equal(source.tickets.length, 20);
  assert.deepEqual(source.tickets.map((ticket) => ticket.nomor_tiket), expected.tickets.map((ticket) => ticket.nomor_tiket));
  expected.tickets.forEach((item, index) => {
    const sourceTicket = source.tickets[index];
    assert.equal(sourceTicket.data_tabel.change_request, item.change_request);
    assert.match(sourceTicket.data_tabel.ditugaskan_kepada, /[A-Za-z]/);
    assert.equal(item.status.nama, 'Closed');
  });
  assert.match(source.tickets[0].detail_tiket.nomor_tiket, /<p|<a/i);
});
