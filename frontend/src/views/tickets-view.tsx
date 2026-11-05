import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { Search, Download, Sparkles, X, Pin, Star } from 'lucide-react';
import type { AISummary, AppState, Ticket } from '@/lib/api';
import { fetchTicketSummary } from '@/lib/http';
import { firstValue } from '@/lib/format';
import { useAISummaries } from '@/hooks/use-ai-summaries';

interface TicketsViewProps {
  state: AppState;
}

const PAGE_SIZE = 8;

export function TicketsView({ state }: TicketsViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const { cache, getFromCache, togglePin, isPinned, exportCSV, clearCache, cacheSize, pinnedCount } = useAISummaries();

  const tickets = state.run?.tickets ?? [];
  const filtered = tickets.filter((ticket) => {
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      [
        ticket.nomor_tiket,
        ticket.data_tabel?.change_request,
        ticket.data_tabel?.description,
        ticket.data_tabel?.ditugaskan_kepada,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    const matchesStatus = !statusFilter || ticket.scrape_status === statusFilter;
    const matchesPinned = !showPinnedOnly || isPinned(ticket.nomor_tiket);
    return matchesQuery && matchesStatus && matchesPinned;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const handleSummarize = async (ticketNumber: string) => {
    const cached = getFromCache(ticketNumber);
    if (cached) { setExpanded(expanded === ticketNumber ? null : ticketNumber); return; }

    setLoading(ticketNumber);
    setErrors(prev => ({ ...prev, [ticketNumber]: null }));
    try {
      const result = await fetchTicketSummary(ticketNumber);
      // saveToCache is not exposed, store directly
      cache.set(ticketNumber, { ...result, ticketNumber, cachedAt: new Date().toISOString() });
      setExpanded(ticketNumber);
    } catch (err) {
      setErrors(prev => ({ ...prev, [ticketNumber]: err instanceof Error ? err.message : 'Gagal memuat ringkasan' }));
    } finally {
      setLoading(null);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Data tickets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tinjau atribut change management, catatan validasi, dan riwayat aktivitas sebelum diekspor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPinnedOnly(!showPinnedOnly)}>
            <Pin className="size-4 mr-1" />
            {showPinnedOnly ? 'Tampilkan semua' : `Pinned (${pinnedCount})`}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={cacheSize === 0}>
            <Download className="size-4 mr-1" />
            Export CSV ({cacheSize})
          </Button>
          <Button variant="ghost" size="sm" onClick={clearCache} disabled={cacheSize === 0}>
            Hapus Cache
          </Button>
          <Button variant="secondary" asChild>
            <a href="/api/export/json" download>
              <Download className="mr-2 size-4" />
              Unduh JSON
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Daftar tiket</CardTitle>
              <p className="text-muted-foreground text-sm">
                {tickets.length ? `${filtered.length} dari ${tickets.length} tiket ditampilkan` : 'Belum ada data tiket.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2 top-2 size-4" />
                <Input
                  placeholder="Cari tiket..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua status</SelectItem>
                  <SelectItem value="success">Berhasil</SelectItem>
                  <SelectItem value="failed">Gagal</SelectItem>
                  <SelectItem value="pending">Belum diproses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket number</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Change request</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scrape status</TableHead>
                <TableHead>AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Tidak ada tiket yang cocok. Periksa pencarian atau jalankan scraping.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((ticket) => (
                  <TicketRow
                    key={ticket.nomor_tiket}
                    ticket={ticket}
                    summary={getFromCache(ticket.nomor_tiket)}
                    expanded={expanded === ticket.nomor_tiket}
                    loading={loading === ticket.nomor_tiket}
                    error={errors[ticket.nomor_tiket]}
                    onToggleSummary={() => handleSummarize(ticket.nomor_tiket)}
                    onTogglePin={() => togglePin(ticket.nomor_tiket)}
                    isPinnedItem={isPinned(ticket.nomor_tiket)}
                  />
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Halaman {safePage} dari {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  Sebelumnya
                </Button>
                <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  Selanjutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TicketRowProps {
  ticket: Ticket;
  summary: AISummary | undefined;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  onToggleSummary: () => void;
  onTogglePin: () => void;
  isPinnedItem: boolean;
}

function TicketRow({ ticket, summary, expanded, loading, error, onToggleSummary, onTogglePin, isPinnedItem }: TicketRowProps) {
  const detailStatus = ticket.detail_tiket?.status?.nama ?? ticket.detail_tiket?.status?.kode ?? 'Belum tersedia';
  const description = firstValue(
    ticket.data_tabel?.deskripsi_permasalahan_text,
    ticket.data_tabel?.deskripsi_permasalahan,
    'Belum tersedia'
  );
  const assigned = firstValue(
    ticket.detail_tiket?.ditugaskan_kepada,
    ticket.detail_tiket?.pic,
    ticket.data_tabel?.ditugaskan_kepada
  );

  return (
    <>
      <TableRow className={summary?.riskLevel === 'high' ? 'bg-red-50 dark:bg-red-950/20' : ''}>
        <TableCell className="font-mono text-xs">{ticket.nomor_tiket}</TableCell>
        <TableCell className="text-xs">{ticket.data_tabel?.created ?? '—'}</TableCell>
        <TableCell className="text-xs">{ticket.data_tabel?.change_request ?? '—'}</TableCell>
        <TableCell className="max-w-xs truncate text-xs">{String(description).slice(0, 90)}</TableCell>
        <TableCell className="text-xs">{String(assigned)}</TableCell>
        <TableCell>
          <span className="text-muted-foreground text-xs">{detailStatus}</span>
        </TableCell>
        <TableCell>
          <StatusBadge status={ticket.scrape_status} />
          {ticket.errors && ticket.errors.length > 0 && (
            <span className="ml-2 text-[oklch(82%_0.14_75)] text-xs">Ada catatan</span>
          )}
        </TableCell>
        <TableCell className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onToggleSummary} disabled={loading}>
            {loading ? '⏳' : summary ? <X className="size-4" /> : <Sparkles className="size-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onTogglePin}>
            {isPinnedItem ? <Star className="size-4 fill-yellow-400 text-yellow-400" /> : <Pin className="size-4" />}
          </Button>
        </TableCell>
      </TableRow>
      {summary && expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/50 px-4 py-3">
            <div className="flex flex-col gap-2 text-xs">
              <div><strong>Ringkasan:</strong> {summary.summary}</div>
              <div className="flex gap-4">
                <span><strong>Risiko:</strong> <RiskBadge level={summary.riskLevel} /></span>
                <span><strong>Kategori:</strong> {summary.category}</span>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
      {error && (
        <TableRow>
          <TableCell colSpan={8} className="bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  const labels = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-medium ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}
