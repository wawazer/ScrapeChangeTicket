import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeMachineId from 'node-machine-id';
import { config } from './config.js';
import { warn } from './logger.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostname = os.hostname();
// Hardware UUID + hostname, hashed so the raw machine UUID never leaves this device.
const deviceId = createHash('sha256').update(`${nodeMachineId.machineIdSync(true)}:${hostname}`).digest('hex');
const TIMEOUT_MS = 8000;

export function licenseDiagnostics() {
  return { deviceId, hostname };
}

function licenseFile() {
  return process.env.ZEVN_LICENSE_FILE || path.join(root, '.zevn-license.json');
}

function storedKey() {
  try {
    return String(JSON.parse(fs.readFileSync(licenseFile(), 'utf8')).licenseKey || '').trim();
  } catch {
    return '';
  }
}

function saveKey(key) {
  try {
    fs.writeFileSync(licenseFile(), JSON.stringify({ licenseKey: key }, null, 2));
  } catch (err) {
    warn('License key gagal disimpan ke disk', { message: err.message });
  }
}

export function deactivateLicense() {
  try {
    fs.rmSync(licenseFile(), { force: true });
  } catch (err) {
    warn('File lisensi gagal dihapus', { message: err.message });
  }
}

export async function verifyLicenseOnline(licenseKey) {
  const key = String(licenseKey || storedKey()).trim();
  if (!key) {
    return { valid: false, reason: 'NO_LICENSE', message: 'Lisensi belum diaktifkan pada perangkat ini.', ...licenseDiagnostics() };
  }

  let response;
  try {
    response = await fetch(config.licenseApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: key, deviceId, hostname, app: 'scrape-ticket' }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    return { valid: false, reason: 'API_UNREACHABLE', message: `Server lisensi tidak dapat dihubungi: ${err.message}`, ...licenseDiagnostics() };
  }

  const body = await response.json().catch(() => ({}));
  if (response.ok && body.valid !== false) {
    saveKey(key);
    return { valid: true, owner: body.owner || body.data?.owner || '', ...licenseDiagnostics() };
  }
  if (response.status === 403) {
    deactivateLicense();
  }
  return {
    valid: false,
    reason: body.reason || `HTTP_${response.status}`,
    message: body.message || (response.status === 403 ? 'Lisensi tidak valid atau telah dicabut.' : `Server lisensi menolak permintaan (HTTP ${response.status}).`),
    ...licenseDiagnostics()
  };
}
