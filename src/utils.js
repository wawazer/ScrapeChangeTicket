import fs from 'node:fs/promises';
import path from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
export const slug = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const ticketNumber = (value) => cleanText(value).match(/\bCTASK\d+\b/i)?.[0]?.toUpperCase() || '';
export const uniqueBy = (items, key) => [...new Map(items.filter(Boolean).map((item) => [key(item), item])).values()];

export async function atomicWriteJson(filePath, value) {
  const serialized = JSON.stringify(value, null, 2);
  JSON.parse(serialized);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${serialized}\n`, 'utf8');
  await fs.rename(temp, filePath);
}

export function retry(operation, retries = 2, onRetry = () => {}) {
  return (async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { return await operation(attempt); } catch (error) {
        lastError = error;
        if (attempt < retries) { onRetry(error, attempt + 1); await sleep(250 * (attempt + 1)); }
      }
    }
    throw lastError;
  })();
}
