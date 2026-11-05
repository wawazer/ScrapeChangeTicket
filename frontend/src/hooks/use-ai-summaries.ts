import { useState, useEffect } from 'react';
import type { AISummary } from '@/lib/api';

interface CachedSummary extends AISummary {
  ticketNumber: string;
  cachedAt: string;
}

const STORAGE_KEY = 'ai-summaries';
const PINNED_KEY = 'ai-summaries-pinned';

export function useAISummaries() {
  const [cache, setCache] = useState<Map<string, CachedSummary>>(new Map());
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    const pinnedList = localStorage.getItem(PINNED_KEY);
    
    if (cached) {
      try {
        const entries = JSON.parse(cached) as Array<[string, CachedSummary]>;
        setCache(new Map(entries));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    
    if (pinnedList) {
      try {
        setPinned(new Set(JSON.parse(pinnedList)));
      } catch {
        localStorage.removeItem(PINNED_KEY);
      }
    }
  }, []);

  // Persist cache to localStorage
  const saveToCache = (ticketNumber: string, summary: AISummary) => {
    const entry: CachedSummary = {
      ...summary,
      ticketNumber,
      cachedAt: new Date().toISOString(),
    };
    const newCache = new Map(cache);
    newCache.set(ticketNumber, entry);
    setCache(newCache);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...newCache.entries()]));
    return entry;
  };

  const getFromCache = (ticketNumber: string) => cache.get(ticketNumber);

  const togglePin = (ticketNumber: string) => {
    const newPinned = new Set(pinned);
    if (newPinned.has(ticketNumber)) {
      newPinned.delete(ticketNumber);
    } else {
      newPinned.add(ticketNumber);
    }
    setPinned(newPinned);
    localStorage.setItem(PINNED_KEY, JSON.stringify([...newPinned]));
  };

  const isPinned = (ticketNumber: string) => pinned.has(ticketNumber);

  const exportCSV = () => {
    const rows = [['Ticket Number', 'Summary', 'Risk Level', 'Category', 'Pinned', 'Cached At']];
    for (const [number, summary] of cache.entries()) {
      rows.push([
        number,
        summary.summary,
        summary.riskLevel,
        summary.category,
        pinned.has(number) ? 'Yes' : 'No',
        summary.cachedAt,
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-summaries-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearCache = () => {
    setCache(new Map());
    setPinned(new Set());
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PINNED_KEY);
  };

  return {
    cache,
    saveToCache,
    getFromCache,
    togglePin,
    isPinned,
    exportCSV,
    clearCache,
    cacheSize: cache.size,
    pinnedCount: pinned.size,
  };
}
