import { useEffect, useRef, useState } from 'react';
import { isBusy, type JobStatus } from '@/lib/api';

const TICK_MS = 1000;

/**
 * Tracks elapsed time while a scraping job is active. The last duration stays on
 * screen after the job settles, so the user can read how long the run took.
 */
export function useScrapingTimer(status: JobStatus | undefined) {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const active = isBusy(status ?? 'idle');

  useEffect(() => {
    if (!active) return;

    if (startedAt.current === null) {
      startedAt.current = Date.now();
      setElapsed(0);
    }

    const interval = setInterval(() => {
      if (startedAt.current === null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / TICK_MS));
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (active) return;
    if (status === 'idle' && elapsed > 0) {
      startedAt.current = null;
      setElapsed(0);
    }
  }, [active, status, elapsed]);

  return { elapsed, active };
}
