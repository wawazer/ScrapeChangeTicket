# Service Scraper 
Aplikasi ini adalah dashboard lokal untuk login ke ServiceNow melalui Playwright, memilih filter secara dinamis, membaca semua halaman tabel, mengambil detail dan Activities satu per satu, menyimpan checkpoint JSON, dan membuat laporan PDF patch release.

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

## Testing

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run lint
```

Smoke test live opsional:

```bash
npm run live:smoke
```

Perintah tersebut hanya berjalan jika `SN_USERNAME` dan `SN_PASSWORD` terisi, membuka browser non-headless, memeriksa login/menu/filter, dan tidak melakukan scraping seluruh data.

