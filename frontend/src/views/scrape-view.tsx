import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Play, Pause, RotateCcw, Trash2 } from 'lucide-react';
import type { AppState, FilterOption } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { useScrapingTimer } from '@/hooks/use-scraping-timer';
import { useScrapeHistory } from '@/hooks/use-scrape-history';

interface ScrapeViewProps {
  state: AppState;
  onRefreshFilters: () => Promise<FilterOption[]>;
  onSelectFilter: (name: string) => void;
  onStartScrape: (opts: { limit: number; includeScreenshot: boolean }) => void;
  onScrapeAction: (action: 'pause' | 'resume' | 'cancel') => void;
}

export function ScrapeView({
  state,
  onRefreshFilters,
  onSelectFilter,
  onStartScrape,
  onScrapeAction,
}: ScrapeViewProps) {
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [limit, setLimit] = useState(0);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('');
  const { elapsed } = useScrapingTimer(state.status);
  const { items: historyItems, clear: clearHistory } = useScrapeHistory();

  const handleStartScrape = () => {
    onStartScrape({ limit: Number(limit) || 0, includeScreenshot });
  };

  const connected = state.connected;
  const isBusy = ['starting', 'reading', 'running', 'paused'].includes(state.status);
  const canPause = state.status === 'running' || state.status === 'reading';
  const canResume = state.status === 'paused';
  const canCancel = isBusy;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Scraping tickets</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Buka sesi, pilih filter ServiceNow, dan jalankan ekstraksi detail tiket secara bertahap.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3">
        <span className="text-sm font-medium">Status sesi</span>
        {connected ? (
          <Badge variant="default">ServiceNow terhubung</Badge>
        ) : (
          <Badge variant="outline">Belum terhubung</Badge>
        )}
        <span className="text-muted-foreground text-xs">
          {connected
            ? 'Sesi aktif. Lanjutkan memilih filter di bawah.'
            : 'Buka sesi dan login melalui tombol di navbar atas.'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  1
                </span>
              </div>
              <div className="flex-1">
                <CardTitle>Pilih filter</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Daftar filter dibaca dari menu ServiceNow yang aktif.</p>
            <Button variant="secondary" onClick={async () => setFilters(await onRefreshFilters())} className="w-full">
              Muat daftar filter
            </Button>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-select">Filter ServiceNow</Label>
              <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                <SelectTrigger id="filter-select">
                  <SelectValue placeholder="Pilih filter" />
                </SelectTrigger>
                <SelectContent>
                  {filters.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                if (selectedFilter) onSelectFilter(selectedFilter);
              }}
              disabled={!selectedFilter}
              className="w-full"
            >
              Pilih filter dan hitung
            </Button>
            {state.estimate > 0 && (
              <div className="text-muted-foreground text-sm">
                Estimasi: <strong className="text-foreground">{state.estimate.toLocaleString('id-ID')} tiket</strong>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                2
              </span>
              <div>
                <CardTitle>Jalankan scraping</CardTitle>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={state.status} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="limit">Batas tiket</Label>
              <Input
                id="limit"
                type="number"
                min="0"
                placeholder="0 untuk semua tiket"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={isBusy}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={includeScreenshot} onCheckedChange={setIncludeScreenshot} disabled={isBusy} />
                <span className="text-sm">Simpan screenshot</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-md bg-card/50 p-2">
              <span className="text-muted-foreground text-xs">Diproses</span>
              <strong className="text-lg font-semibold tabular-nums">{state.processed}</strong>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-card/50 p-2">
              <span className="text-muted-foreground text-xs">Total</span>
              <strong className="text-lg font-semibold tabular-nums">{state.total}</strong>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-card/50 p-2">
              <span className="text-muted-foreground text-xs">Tiket aktif</span>
              <strong className="text-sm truncate">{state.current || '—'}</strong>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-card/50 p-2">
              <span className="text-muted-foreground text-xs">Durasi</span>
              <strong className="text-lg font-semibold font-mono">{formatDuration(elapsed)}</strong>
            </div>
          </div>

          <Progress value={state.total ? Math.round((state.processed / state.total) * 100) : 0} />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {state.current && (
              <span className="text-muted-foreground">
                Memproses <span className="font-mono">{state.current}</span>...
              </span>
            )}
            <span className="font-mono tabular-nums text-muted-foreground" aria-live="off">
              ⏱️ {formatDuration(elapsed)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStartScrape} disabled={isBusy || !selectedFilter} className="flex items-center gap-2">
              <Play className="size-4" />
              Mulai scraping
            </Button>
            <Button
              variant="secondary"
              onClick={() => onScrapeAction('pause')}
              disabled={!canPause}
              className="flex items-center gap-2"
            >
              <Pause className="size-4" />
              Pause
            </Button>
            <Button
              variant="secondary"
              onClick={() => onScrapeAction('resume')}
              disabled={!canResume}
              className="flex items-center gap-2"
            >
              <RotateCcw className="size-4" />
              Lanjutkan
            </Button>
            <Button
              variant="destructive"
              onClick={() => onScrapeAction('cancel')}
              disabled={!canCancel}
              className="flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              Batalkan
            </Button>
          </div>

          {state.message && (
            <p className={`text-sm ${state.status === 'error' ? 'text-[oklch(78%_0.16_25)]' : 'text-muted-foreground'}`}>
              {state.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Riwayat scraping</CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Hapus riwayat
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus riwayat scraping?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tindakan ini akan menghapus semua riwayat scraping yang tersimpan di browser lokal. Ini tidak dapat dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={clearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {historyItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">Belum ada riwayat run. Run baru akan muncul setelah data diterima.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Waktu</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Filter</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Total</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Progress</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <tr key={item.key} className="border-b border-border hover:bg-card/50">
                      <td className="px-2 py-2 text-xs">{new Date(item.at).toLocaleString('id-ID')}</td>
                      <td className="px-2 py-2">{item.filter}</td>
                      <td className="px-2 py-2 tabular-nums">{item.total}</td>
                      <td className="px-2 py-2 text-xs">
                        {item.processed} / {item.total}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {item.success} berhasil, {item.failed} gagal
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
