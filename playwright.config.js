import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15000,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true },
  webServer: { command: 'node src/server.js', url: 'http://127.0.0.1:3100', env: { PORT: '3100', NODE_ENV: 'test' }, reuseExistingServer: true, timeout: 30000 }
});
