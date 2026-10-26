import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateTickets, htmlToText, makeMetadata, mapColumns, parseActivities, parseDetailFields, parseStatus, parseTableRows, reportTicket, validateExportData } from '../../src/parsers.js';

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
