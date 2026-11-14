import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const calls = [];
let reply = { status: 200, body: { valid: true, owner: 'Pelindo IT' } };

const api = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    calls.push(JSON.parse(raw));
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zevn-license-'));
const licenseFile = path.join(directory, '.zevn-license.json');
process.env.ZEVN_LICENSE_API_URL = `http://127.0.0.1:${api.address().port}/verify`;
process.env.ZEVN_LICENSE_FILE = licenseFile;
process.env.NO_SERVER = 'true';

const { verifyLicenseOnline, deactivateLicense } = await import('../../src/license.js');
const exists = () => fs.access(licenseFile).then(() => true, () => false);

test('no stored key reports NO_LICENSE without calling the license server', async () => {
  const result = await verifyLicenseOnline();
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'NO_LICENSE');
  assert.match(result.deviceId, /^[a-f0-9]{64}$/);
  assert.equal(result.hostname, os.hostname());
  assert.equal(calls.length, 0);
});

test('a 200 response binds the key to this device and stores it locally', async () => {
  const result = await verifyLicenseOnline('ZEVN-TEST-0001');
  assert.equal(result.valid, true);
  assert.equal(result.owner, 'Pelindo IT');
  assert.deepEqual(calls.at(-1), { licenseKey: 'ZEVN-TEST-0001', deviceId: result.deviceId, hostname: os.hostname(), app: 'scrape-ticket' });
  assert.deepEqual(JSON.parse(await fs.readFile(licenseFile, 'utf8')), { licenseKey: 'ZEVN-TEST-0001' });
});

test('the stored key is reused when no key argument is given', async () => {
  const result = await verifyLicenseOnline();
  assert.equal(result.valid, true);
  assert.equal(calls.at(-1).licenseKey, 'ZEVN-TEST-0001');
});

test('a 403 response wipes the local key and keeps the server reason', async () => {
  reply = { status: 403, body: { reason: 'DEVICE_MISMATCH', message: 'Lisensi sudah terikat pada perangkat lain.' } };
  const result = await verifyLicenseOnline();
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'DEVICE_MISMATCH');
  assert.equal(result.message, 'Lisensi sudah terikat pada perangkat lain.');
  assert.equal(await exists(), false);
});

test('a 403 on activation does not store the new key', async () => {
  const result = await verifyLicenseOnline('ZEVN-REVOKED');
  assert.equal(result.valid, false);
  assert.equal(await exists(), false);
});

test('a non-403 server error keeps the stored key', async () => {
  reply = { status: 500, body: { message: 'boom' } };
  await fs.writeFile(licenseFile, JSON.stringify({ licenseKey: 'ZEVN-TEST-0001' }));
  const result = await verifyLicenseOnline();
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'HTTP_500');
  assert.equal(await exists(), true);
});

test('deactivate removes the local key', async () => {
  deactivateLicense();
  assert.equal(await exists(), false);
});

test('scrape and AI endpoints answer 403 LICENSE_REQUIRED without a license', async () => {
  const { app } = await import('../../src/server.js');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/api/scrape', '/api/ai/analyze-risk', '/api/session/start']) {
      const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 403, route);
      const body = await response.json();
      assert.equal(body.error, 'LICENSE_REQUIRED', route);
      assert.equal(body.reason, 'NO_LICENSE', route);
    }
    const status = await fetch(`${base}/api/license/status`).then((response) => response.json());
    assert.equal(status.valid, false);
    assert.ok(status.deviceId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => api.close(resolve));
  }
});
