import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { StatusBadge } from '@/components/status-badge';
import type { HistoryItem } from '@/hooks/use-scrape-history';

interface HistoryViewProps {
  history: HistoryItem[];
  onClear: () => void;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
}

export function HistoryView({ history, onClear }: HistoryViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Riwayat scraping</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Daftar eksekusi scraping yang tersimpan. Hapus semua riwayat jika tidak diperlukan.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Hapus riwayat</Button>
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
              <AlertDialogAction onClick={onClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Hapus semua
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catatan eksekusi</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              Belum ada riwayat scraping. Mulai scraping untuk mengisi daftar ini.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Filter</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Diproses</TableHead>
                  <TableHead>Berhasil</TableHead>
                  <TableHead>Gagal</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell className="text-xs">{formatTimestamp(item.at)}</TableCell>
                    <TableCell className="font-mono text-xs">{item.filter}</TableCell>
                    <TableCell className="text-xs">{item.total}</TableCell>
                    <TableCell className="text-xs">{item.processed}</TableCell>
                    <TableCell className="text-xs">{item.success}</TableCell>
                    <TableCell className="text-xs">{item.failed}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
