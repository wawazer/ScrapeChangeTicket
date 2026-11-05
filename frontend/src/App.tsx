import { useState, useMemo } from 'react';
import { Sidebar, type ViewId } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { DashboardView } from '@/views/dashboard-view';
import { ScrapeView } from '@/views/scrape-view';
import { TicketsView } from '@/views/tickets-view';
import { HistoryView } from '@/views/history-view';
import { ReportsView } from '@/views/reports-view';
import { SettingsView } from '@/views/settings-view';
import { useAppState } from '@/hooks/use-app-state';
import { useScrapeHistory } from '@/hooks/use-scrape-history';

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard');
  const { state, notice, startBrowser, login, refreshFilters, selectFilter, startScrape, scrapeAction } = useAppState();
  const { items: historyItems, clear: clearHistory } = useScrapeHistory();

  const title = useMemo(() => {
    switch (view) {
      case 'dashboard': return 'Dashboard';
      case 'scrape': return 'Scraping tickets';
      case 'tickets': return 'Data tickets';
      case 'history': return 'Riwayat scraping';
      case 'reports': return 'Export reports';
      case 'settings': return 'Settings';
      default: return 'Dashboard';
    }
  }, [view]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Menghubungkan ke server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar view={view} onViewChange={setView} connected={state.connected} />
      <div className="flex flex-1 flex-col md:ml-64">
        <Topbar
          title={title}
          connected={state.connected}
          onStartBrowser={startBrowser}
          onLogin={login}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {notice.message && (
            <div
              className={`mb-4 rounded-md px-4 py-3 text-sm ${
                notice.level === 'error'
                  ? 'bg-[oklch(20%_0.04_25)] text-[oklch(78%_0.16_25)] border border-[oklch(78%_0.16_25)]/20'
                  : 'bg-[oklch(20%_0.04_145)] text-[oklch(82%_0.14_145)] border border-[oklch(82%_0.14_145)]/20'
              }`}
              role="status"
              aria-live="polite"
            >
              {notice.message}
            </div>
          )}

          {view === 'dashboard' && <DashboardView state={state} onStartScrape={() => setView('scrape')} />}
          {view === 'scrape' && (
            <ScrapeView
              state={state}
              onRefreshFilters={refreshFilters}
              onSelectFilter={selectFilter}
              onStartScrape={startScrape}
              onScrapeAction={scrapeAction}
            />
          )}
          {view === 'tickets' && <TicketsView state={state} />}
          {view === 'history' && <HistoryView history={historyItems} onClear={clearHistory} />}
          {view === 'reports' && <ReportsView state={state} />}
          {view === 'settings' && <SettingsView state={state} />}
        </main>
      </div>
    </div>
  );
}
