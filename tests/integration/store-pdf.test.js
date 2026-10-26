import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRun, loadRun, saveRun, upsertTicket } from '../../src/store.js';
import { generatePdf } from '../../src/pdf.js';

test('stores a multi-ticket checkpoint atomically and generates a PDF', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-scraper-'));
  const run = createRun('CTASK SEPTEMBER');
  upsertTicket(run, { nomor_tiket: 'CTASK0016976', data_tabel: {}, detail_tiket: { pic: 'Mohamad Romli', deskripsi_permasalahan_text: 'Two paragraphs' }, activities: [], activities_status: 'success', scrape_status: 'success', errors: [] });
  upsertTicket(run, { nomor_tiket: 'CTASK0016977', data_tabel: {}, detail_tiket: {}, activities: [], activities_status: 'error', scrape_status: 'failed', errors: ['detail timeout'] });
  const jsonPath = path.join(directory, 'result.json'); await saveRun(run, jsonPath); const loaded = await loadRun(jsonPath);
  assert.equal(loaded.tickets.length, 2); assert.equal(loaded.metadata.success, 1);
  const pdfPath = path.join(directory, 'report.pdf'); await generatePdf(loaded, pdfPath, { period: 'September 2026' });
  const stat = await fs.stat(pdfPath); assert.ok(stat.size > 1000);
  assert.equal((await fs.readFile(jsonPath, 'utf8')).includes('SN_PASSWORD'), false);
});
