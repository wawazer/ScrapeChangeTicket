# Service Scraper 
Aplikasi ini adalah dashboard lokal untuk login ke ServiceNow melalui Playwright, memilih filter secara dinamis, membaca semua halaman tabel, mengambil detail dan Activities satu per satu, menyimpan checkpoint JSON, dan membuat laporan PDF patch release.

## Status workspace

Workspace awal tidak berisi source prototype. Implementasi ini mempertahankan selector dan alur navigasi yang disebutkan pada spesifikasi. Pencocokan visual PDF dan smoke test produksi memerlukan file referensi serta akses ServiceNow yang valid.

## Instalasi

1. Gunakan Node.js 20 atau lebih baru.
2. Jalankan `npm install`.
3. Jalankan `npx playwright install chromium` satu kali.
4. Salin `.env.example` menjadi `.env`, lalu isi kredensial secara lokal:

```env
SN_BASE_URL=https:/
SN_USERNAME=
SN_PASSWORD=
HEADLESS=false
PORT=3000
SN_MAX_RETRIES=2
SN_PAGE_SIZE=100
SN_CHECKPOINT_EVERY=5
SN_CONCURRENCY=1
OUTPUT_DIR=output
PELINDO_LOGO_PATH=assets/pelindo-logo.png
```

Password tidak dicetak ke log dan `.env` diabaikan Git.

## Menjalankan aplikasi

```bash
npm start
```

Buka `http://localhost:3000`. Klik **Buka browser**, kemudian **Login ServiceNow**. Jika login otomatis tidak menemukan form aktual, selesaikan login pada browser Chromium yang terbuka.

Alur penggunaan:

1. **Refresh filter** membaca `div.context_item` setelah tombol `#change_task_control_button` dan menu `item_id` dibuka.
2. Pilih filter yang terdeteksi atau masukkan nama filter manual untuk diagnosis browser.
3. Klik **Pilih filter & hitung** untuk membaca estimasi.
4. Isi jumlah tiket; `0` berarti semua tiket.
5. Jalankan, pause, resume, atau cancel scraping.
6. Pilih checkbox tiket bila ingin membuat PDF sebagian.
7. Unduh JSON atau buat PDF.

Workspace frontend menyediakan area Dashboard, Scraping tickets, Data tickets, Riwayat scraping, Export reports, dan Settings. Tabel data membaca nilai aktual dari run ServiceNow; klik nomor tiket untuk melihat detail, description yang disanitasi, activities, dan catatan validasi.

Checkpoint tersimpan sebagai `output/<filter>-checkpoint.json` setelah setiap tiket. JSON ekspor menggunakan penulisan atomik dan memiliki metadata, data tabel, detail, Activities, status, serta error per tiket.

## PDF

API PDF menerima `ticketNumbers`, `period`, dan `overrides`. Upload bukti tersedia melalui `/api/upload-evidence`; gambar yang tersimpan diteruskan ke generator melalui opsi `screenshots`.

Laporan menggunakan layout Letter portrait yang diukur dari `assets/template-reference.png`. Logo lokal default berada di `assets/pelindo-logo.png`; generator menghentikan ekspor dengan error informatif apabila aset tersebut tidak ditemukan. Fixture dan pemeriksaan layout tersedia melalui `npm run test:visual`.

## Testing

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run lint
```

Tes unit memeriksa mapping, status, HTML, Activities, deduplikasi, metadata, validasi, dan data laporan. Tes integrasi memeriksa checkpoint JSON dan PDF. E2E memeriksa dashboard lokal dan tidak adanya kredensial dalam UI. Tidak ada tes yang melakukan scraping produksi.

Fixture mapping aktual berada di `tests/fixtures/actual-servicenow-result.json` dengan expected mapping di `tests/fixtures/actual-servicenow-expected.json`. Pemeriksaan UI Hallmark menggunakan `node C:/Users/admin/.agents/skills/hallmark/scripts/sloplint.mjs public --scope app --genre modern-minimal --kept`.

Smoke test live opsional:

```bash
npm run live:smoke
```

Perintah tersebut hanya berjalan jika `SN_USERNAME` dan `SN_PASSWORD` terisi, membuka browser non-headless, memeriksa login/menu/filter, dan tidak melakukan scraping seluruh data.

## Diagnosis

Jika selector tidak cocok dengan DOM aktual, aplikasi tidak mengarang filter/tiket. Browser dibiarkan terbuka dan `ServiceNowClient.diagnose()` dapat menyimpan snapshot DOM ke `diagnostics/`. Periksa log untuk tahap login, menu, filter, tabel, pagination, detail, Activities, checkpoint, dan ekspor.
