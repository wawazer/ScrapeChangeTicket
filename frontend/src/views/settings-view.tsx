import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppState } from '@/lib/api';

interface SettingsViewProps {
  state: AppState;
}

export function SettingsView({ state }: SettingsViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Konfigurasi sistem dan informasi sesi Chromium yang sedang aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status sesi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Koneksi browser</span>
              <span className="font-mono text-xs">
                {state.connected ? (
                  <span className="text-green-500">Terhubung</span>
                ) : (
                  <span className="text-muted-foreground">Belum aktif</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status scraping</span>
              <span className="font-mono text-xs capitalize">{state.status}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Filter aktif</span>
              <span className="font-mono text-xs">{state.selectedFilter || '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informasi sistem</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Aplikasi</span>
              <span className="font-mono text-xs">ScrapeChangeTicket</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Versi</span>
              <span className="font-mono text-xs">1.0.0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-mono text-xs">{import.meta.env.MODE}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>API Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="rounded-md bg-card/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              <p>GET /api/state - Fetch aplikasi state</p>
              <p>POST /api/session/start - Buka browser Chromium</p>
              <p>POST /api/login - Verifikasi login ServiceNow</p>
              <p>POST /api/filters/refresh - Load filter list</p>
              <p>POST /api/filters/select - Select filter &amp; estimate</p>
              <p>POST /api/scrape - Start scraping job</p>
              <p>POST /api/scrape/pause - Pause job</p>
              <p>POST /api/scrape/resume - Resume job</p>
              <p>POST /api/scrape/cancel - Cancel job</p>
              <p>GET /api/export/json - Export JSON</p>
              <p>GET /api/export/pdf - Export PDF</p>
              <p>GET /api/export/excel - Export Excel</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
