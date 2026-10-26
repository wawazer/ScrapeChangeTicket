import { config } from '../../src/config.js';
import { ServiceNowClient } from '../../src/servicenow.js';

if (!config.username || !config.password) {
  console.error('Live smoke test dilewati: SN_USERNAME/SN_PASSWORD belum diisi pada .env');
  process.exit(0);
}
const client = new ServiceNowClient({ headless: false });
try {
  const login = await client.login();
  if (!login.loggedIn) throw new Error('Login live belum terdeteksi');
  await client.openChangeTaskMenu();
  const filters = await client.openFilters();
  console.log(`Live smoke berhasil membaca ${filters.length} filter; tidak ada scraping produksi dijalankan.`);
} catch (error) {
  console.error(`Live smoke gagal: ${error.message}`);
  process.exitCode = 1;
} finally { await client.close(); }
