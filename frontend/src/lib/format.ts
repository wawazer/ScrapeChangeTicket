const STATUS_LABELS: Record<string, string> = {
  success: 'Berhasil',
  failed: 'Gagal',
  pending: 'Belum diproses',
  cancelled: 'Dibatalkan',
  running: 'Berjalan',
  reading: 'Membaca',
  completed: 'Selesai',
  idle: 'Idle',
  starting: 'Memulai',
  error: 'Error',
  paused: 'Dijeda',
};

export function statusLabel(status?: string) {
  if (!status) return 'Belum tersedia';
  return STATUS_LABELS[status] ?? status;
}

const SYS_ID = /^[a-f0-9]{24,40}$/i;

export function isSysId(value: unknown) {
  return SYS_ID.test(String(value ?? '').trim());
}

export function firstValue(...values: unknown[]) {
  return (
    values.find(
      (item) => item !== undefined && item !== null && String(item).trim() && !isSysId(item)
    ) ?? 'Belum tersedia'
  );
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
