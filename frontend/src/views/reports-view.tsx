import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FileText, FileSpreadsheet } from 'lucide-react';
import type { AppState } from '@/lib/api';
import { downloadFile, exportFilename } from '@/lib/http';

interface ReportsViewProps {
  state: AppState;
}

export function ReportsView({ state }: ReportsViewProps) {
  const [period, setPeriod] = useState('');
  const [resultDefault, setResultDefault] = useState('');
  const [includeFailed, setIncludeFailed] = useState(false);

  const exportDisabled = !state.export?.ready;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Export reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ekspor hasil scraping ke PDF atau Excel. Pastikan scraping telah selesai sebelum mengekspor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Opsi ekspor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="period">Periode</Label>
              <Input
                id="period"
                placeholder="Contoh: Januari 2025"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="result-default">Result default</Label>
              <Input
                id="result-default"
                placeholder="Contoh: Berhasil diproses"
                value={resultDefault}
                onChange={(e) => setResultDefault(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={includeFailed} onCheckedChange={setIncludeFailed} />
              <span className="text-sm">Sertakan tiket gagal</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total tiket</span>
              <strong className="tabular-nums">{state.export?.total ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Berhasil</span>
              <strong className="tabular-nums">{state.export?.count ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gagal</span>
              <strong className="tabular-nums">{state.export?.failed ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Filter</span>
              <span className="font-mono text-xs">{state.export?.filter || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="text-xs">{state.export?.ready ? 'Siap ekspor' : 'Belum siap'}</span>
            </div>
            {state.export?.reason && (
              <p className="text-[oklch(78%_0.16_25)] text-xs">{state.export.reason}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={exportDisabled}
          onClick={() => downloadFile('/api/export/pdf', {}, exportFilename(state.export?.filter, 'pdf'))}
        >
          <FileText className="mr-2 size-4" />
          Ekspor PDF
        </Button>
        <Button
          variant="secondary"
          disabled={exportDisabled}
          onClick={() => downloadFile('/api/export/excel', {}, exportFilename(state.export?.filter, 'xlsx'))}
        >
          <FileSpreadsheet className="mr-2 size-4" />
          Ekspor Excel
        </Button>
      </div>
    </div>
  );
}
