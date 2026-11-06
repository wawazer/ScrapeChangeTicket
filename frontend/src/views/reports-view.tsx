import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, FileSpreadsheet, CopyCheck, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AppState, DuplicateDetectionResult } from '@/lib/api';
import { downloadFile, exportFilename, fetchDuplicateDetection } from '@/lib/http';

interface ReportsViewProps {
  state: AppState;
}

const MATCH_BADGES: Record<string, { label: string; className: string }> = {
  HIGH: { label: 'Tinggi (>=85%)', className: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30' },
  MEDIUM: { label: 'Sedang (70-84%)', className: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
  LOW: { label: 'Rendah (<70%)', className: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30' },
};

export function ReportsView({ state }: ReportsViewProps) {
  const [period, setPeriod] = useState('');
  const [resultDefault, setResultDefault] = useState('');
  const [includeFailed, setIncludeFailed] = useState(false);

  // Duplicate detection state
  const [analyzingDuplicates, setAnalyzingDuplicates] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateDetectionResult[]>([]);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const exportDisabled = !state.export?.ready;
  const tickets = state.run?.tickets?.filter((t) => t.scrape_status === 'success') || [];

  const handleRunDuplicateDetection = async () => {
    if (tickets.length === 0) {
      setDuplicateError('Tidak ada tiket yang berhasil di-scrape pada sesi ini.');
      return;
    }

    setAnalyzingDuplicates(true);
    setDuplicateError(null);
    const results: DuplicateDetectionResult[] = [];

    try {
      // shortcut: analisis tiket yang tersedia pada run secara berurutan
      for (const target of tickets) {
        const targetPayload = {
          number: target.nomor_tiket,
          short_description: target.detail_tiket?.deskripsi_singkat || target.data_tabel?.deskripsi_singkat || target.data_tabel?.short_description || '',
          configuration_item: target.detail_tiket?.configuration_item || target.data_tabel?.configuration_item || '',
          application: target.detail_tiket?.application || target.data_tabel?.application || '',
          description: target.detail_tiket?.deskripsi_permasalahan || target.data_tabel?.deskripsi_permasalahan || '',
          requestor: target.detail_tiket?.requestor || '',
          nipp: target.detail_tiket?.nipp_nrk || '',
        };

        const res = await fetchDuplicateDetection(targetPayload);
        if (res) {
          results.push(res);
        }
      }
      setDuplicateResults(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan deteksi duplikasi';
      setDuplicateError(msg);
    } finally {
      setAnalyzingDuplicates(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Export reports & Analitik</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ekspor hasil scraping ke PDF/Excel dan jalankan analisis duplikasi tiket historis.
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
          variant="outline"
          disabled={exportDisabled}
          onClick={() => {
            const params = new URLSearchParams({
              period,
              resultDefault,
            });
            window.open(`/api/export/pdf-preview?${params}`, '_blank', 'noopener');
          }}
        >
          <FileText className="mr-2 size-4" />
          Preview PDF
        </Button>
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

      {/* Phase 3: Duplicate & Recurring Issue Detection Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CopyCheck className="size-5 text-primary" />
              Deteksi Duplikasi & Insiden Berulang (Phase 3 AI)
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Bandingkan semantik tiket target dengan tiket historis pada CI/Aplikasi terkait.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleRunDuplicateDetection}
            disabled={analyzingDuplicates || tickets.length === 0}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${analyzingDuplicates ? 'animate-spin' : ''}`} />
            {analyzingDuplicates ? 'Menganalisis...' : 'Jalankan Deteksi'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {duplicateError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-md">
              {duplicateError}
            </div>
          )}

          {duplicateResults.length === 0 && !analyzingDuplicates && (
            <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-md">
              Belum ada analisis duplikasi yang dijalankan. Klik &quot;Jalankan Deteksi&quot; di atas untuk memindai tiket run aktif.
            </div>
          )}

          {duplicateResults.length > 0 && (
            <div className="space-y-4">
              {duplicateResults.map((res) => (
                <div key={res.target_ticket_number} className="border rounded-md p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{res.target_ticket_number}</span>
                      {res.has_duplicates ? (
                        <Badge variant="outline" className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 gap-1">
                          <AlertTriangle className="size-3" /> Ada Duplikasi
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 gap-1">
                          <CheckCircle2 className="size-3" /> Unik (Tidak Ada Duplikasi)
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground italic">
                    <strong className="text-foreground">Saran Operator:</strong> {res.recommendation}
                  </p>

                  {res.duplicates.length > 0 ? (
                    <div className="border rounded-sm overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[140px] text-xs">Tiket Historis</TableHead>
                            <TableHead className="w-[110px] text-xs">Skor Kemiripan</TableHead>
                            <TableHead className="w-[140px] text-xs">Level</TableHead>
                            <TableHead className="w-[110px] text-xs">Pola Berulang</TableHead>
                            <TableHead className="text-xs">Alasan Analisis</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {res.duplicates.map((d) => {
                            const badge = MATCH_BADGES[d.match_level] || MATCH_BADGES.LOW;
                            return (
                              <TableRow key={d.ticket_number}>
                                <TableCell className="font-mono text-xs font-semibold">{d.ticket_number}</TableCell>
                                <TableCell className="text-xs font-bold">{Math.round(d.similarity_score * 100)}%</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={badge.className}>
                                    {badge.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">
                                  {d.is_recurring_issue ? (
                                    <span className="text-red-500 font-semibold">Ya</span>
                                  ) : (
                                    <span className="text-muted-foreground">Tidak</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">{d.reason}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-1">
                      Tidak ditemukan tiket historis yang memiliki skor kemiripan di atas ambang batas.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

