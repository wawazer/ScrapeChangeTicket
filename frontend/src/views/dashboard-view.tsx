import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MetricCard } from '@/components/metric-card';
import { StatusBadge } from '@/components/status-badge';
import { TicketCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { AppState } from '@/lib/api';
import { statusLabel } from '@/lib/format';

interface DashboardViewProps {
  state: AppState;
  onStartScrape: () => void;
}

export function DashboardView({ state, onStartScrape }: DashboardViewProps) {
  const metadata = state.run?.metadata ?? {};
  const total = metadata.total_found ?? state.estimate ?? 0;
  const processed = metadata.processed ?? state.processed ?? 0;
  const success = metadata.success ?? 0;
  const failed = metadata.failed ?? 0;
  const pending = Math.max(total - processed, 0);
  const percent = state.total ? Math.round((state.processed / state.total) * 100) : state.status === 'completed' ? 100 : 0;
  const logs = state.logs ?? [];
  const recentLogs = [...logs].slice(-6).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard operasional</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pantau proses scraping ServiceNow dan kesiapan data laporan Pelindo secara real-time.
          </p>
        </div>
        <Button onClick={onStartScrape}>Mulai scraping</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total tiket ditemukan"
          value={total ? total.toLocaleString('id-ID') : 'Belum ada'}
          hint={metadata.filter_name ? `Filter ${metadata.filter_name}` : 'Pilih filter ServiceNow'}
          tone="accent"
          icon={<TicketCheck className="size-4" />}
        />
        <MetricCard
          label="Berhasil diproses"
          value={success ? success.toLocaleString('id-ID') : 'Belum ada'}
          hint={success ? `${success} tiket selesai` : 'Menunggu proses'}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
        <MetricCard
          label="Gagal diproses"
          value={failed ? failed.toLocaleString('id-ID') : 'Belum ada'}
          hint={failed ? `${failed} tiket perlu diperiksa` : 'Tidak ada error'}
          tone="danger"
          icon={<XCircle className="size-4" />}
        />
        <MetricCard
          label="Belum diproses"
          value={pending ? pending.toLocaleString('id-ID') : 'Belum ada'}
          hint={pending ? 'Masih dalam antrean' : 'Semua tiket selesai'}
          tone="amber"
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Performa operasional</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums">{percent}% Selesai</span>
              </div>
              <Progress value={percent} />
              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Berhasil: <strong className="text-foreground">{success}</strong></span>
                <span>Gagal: <strong className="text-foreground">{failed}</strong></span>
                <span>Pending: <strong className="text-foreground">{pending}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Run aktif</CardTitle>
              <StatusBadge status={state.status} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Filter</dt>
                <dd>{state.selectedFilter || metadata.filter_name || 'Belum dipilih'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Estimasi tiket</dt>
                <dd>{state.estimate ? state.estimate.toLocaleString('id-ID') : 'Belum tersedia'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Progress</dt>
                <dd>{state.total ? `${state.processed} dari ${state.total}` : statusLabel(state.status)}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-xs">{state.message || 'Siap menerima konfigurasi.'}</p>
            <p className="text-sm">
              {state.current ? `Memproses ${state.current}` : 'Tidak ada tiket yang sedang diproses'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktivitas terbaru</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Belum ada aktivitas scraping.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentLogs.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex items-start gap-3 text-sm">
                  <span
                    className={
                      entry.level === 'error'
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-[oklch(78%_0.16_25)]'
                        : entry.level === 'warn'
                          ? 'mt-1.5 size-2 shrink-0 rounded-full bg-[oklch(82%_0.14_75)]'
                          : 'mt-1.5 size-2 shrink-0 rounded-full bg-primary'
                    }
                    aria-hidden="true"
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span>{entry.message}</span>
                    <time className="text-muted-foreground text-xs">
                      {new Date(entry.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <pre className="bg-input/30 max-h-48 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
            {logs.length
              ? logs
                  .map(
                    (entry) =>
                      `[${new Date(entry.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${entry.message}`
                  )
                  .join('\n')
              : 'Belum ada log.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
