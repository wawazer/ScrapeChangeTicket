import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '@/lib/http';
import type { AppState, FilterOption } from '@/lib/api';

export interface Notice {
  message: string;
  level: 'info' | 'error';
}

const POLL_MS = 1000;

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [notice, setNotice] = useState<Notice>({ message: '', level: 'info' });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string, level: 'info' | 'error' = 'info') => {
    setNotice({ message, level });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice({ message: '', level: 'info' }), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await request<AppState>('/api/state'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Permintaan gagal';
      if (message) setNotice({ message, level: 'error' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const next = await request<AppState>('/api/state');
        setState((prev) => (prev?.status === 'error' && next.status === 'idle' ? prev : next));
      } catch {
        /* Server briefly unreachable; keep the last known state. */
      }
    };
    const interval = setInterval(poll, POLL_MS);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const startBrowser = useCallback(async () => {
    try {
      await request('/api/session/start', { method: 'POST', body: '{}' });
      announce('Browser ServiceNow dibuka.');
      await refresh();
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Gagal membuka browser', 'error');
    }
  }, [announce, refresh]);

  const login = useCallback(async () => {
    try {
      const result = await request<{ loggedIn: boolean }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ manual: true }),
      });
      announce(result.loggedIn ? 'Login ServiceNow terdeteksi.' : 'Selesaikan login pada browser ServiceNow.');
      await refresh();
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Login gagal', 'error');
    }
  }, [announce, refresh]);

  const refreshFilters = useCallback(async () => {
    try {
      const result = await request<{ filters: FilterOption[] }>('/api/filters/refresh', {
        method: 'POST',
        body: '{}',
      });
      announce(`${result.filters.length} filter ditemukan.`);
      await refresh();
      return result.filters;
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Gagal memuat filter', 'error');
      return [];
    }
  }, [announce, refresh]);

  const selectFilter = useCallback(
    async (name: string) => {
      try {
        const result = await request<{ estimate: number }>('/api/filters/select', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        announce(`Filter aktif: ${name} (estimasi ${result.estimate.toLocaleString('id-ID')} tiket).`);
        await refresh();
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Gagal memilih filter', 'error');
      }
    },
    [announce, refresh]
  );

  const startScrape = useCallback(
    async (options: { limit: number; includeScreenshot: boolean }) => {
      try {
        await request('/api/scrape', { method: 'POST', body: JSON.stringify(options) });
        announce('Scraping dimulai.');
        await refresh();
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Gagal memulai scraping', 'error');
      }
    },
    [announce, refresh]
  );

  const scrapeAction = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      try {
        await request(`/api/scrape/${action}`, { method: 'POST', body: '{}' });
        await refresh();
      } catch (error) {
        announce(error instanceof Error ? error.message : `Aksi ${action} gagal`, 'error');
      }
    },
    [announce, refresh]
  );

  return {
    state,
    notice,
    announce,
    refresh,
    startBrowser,
    login,
    refreshFilters,
    selectFilter,
    startScrape,
    scrapeAction,
  };
}
