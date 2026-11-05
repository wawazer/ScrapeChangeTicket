import { useCallback, useEffect, useState } from 'react';
import type { JobStatus, Run } from '@/lib/api';

export interface HistoryItem {
  key: string;
  at: string;
  filter: string;
  total: number;
  processed: number;
  success: number;
  failed: number;
  status: JobStatus;
}

export const HISTORY_STORAGE_KEY = 'scrape-history';
const HISTORY_LIMIT = 20;

function readHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function useScrapeHistory() {
  const [items, setItems] = useState<HistoryItem[]>(() => readHistory());

  const refresh = useCallback(() => setItems(readHistory()), []);

  const record = useCallback((run: Run | null | undefined, status: JobStatus) => {
    const metadata = run?.metadata;
    if (!metadata) return;
    const key = `${metadata.filter_name}:${metadata.scraped_at}`;
    const current = readHistory();
    if (current.some((entry) => entry.key === key)) return;

    const item: HistoryItem = {
      key,
      at: metadata.scraped_at || new Date().toISOString(),
      filter: metadata.filter_name || 'Belum tersedia',
      total: metadata.total_found ?? 0,
      processed: metadata.processed ?? 0,
      success: metadata.success ?? 0,
      failed: metadata.failed ?? 0,
      status,
    };
    const next = [item, ...current].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    setItems([]);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  return { items, record, clear, refresh };
}
