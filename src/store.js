import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './utils.js';
import { makeMetadata, validateExportData } from './parsers.js';

export function createRun(filterName = '') {
  return { metadata: makeMetadata({ filterName, tickets: [], totalFound: 0 }), tickets: [] };
}

export function upsertTicket(run, ticket) {
  const index = run.tickets.findIndex((item) => item.nomor_tiket === ticket.nomor_tiket);
  if (index >= 0) run.tickets[index] = { ...run.tickets[index], ...ticket };
  else run.tickets.push(ticket);
  run.metadata = makeMetadata({ filterName: run.metadata.filter_name, totalFound: run.metadata.total_found, tickets: run.tickets, scrapedAt: run.metadata.scraped_at });
  return run;
}

export async function saveRun(run, filePath) {
  validateExportData(run);
  await atomicWriteJson(filePath, run);
  return filePath;
}

export async function loadRun(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const run = JSON.parse(content);
  validateExportData(run);
  return run;
}

export function checkpointPath(outputDir, filterName) {
  const safeName = String(filterName || 'run').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return path.join(outputDir, `${safeName || 'run'}-checkpoint.json`);
}
