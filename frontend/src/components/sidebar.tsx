import { useEffect, useState } from 'react';
import { LayoutDashboard, TextSearch, Database, History, FileText, Settings } from 'lucide-react';
import { useLicense } from '@/components/license-gate';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ViewId = 'dashboard' | 'scrape' | 'tickets' | 'history' | 'reports' | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scrape', label: 'Scraping tickets', icon: TextSearch },
  { id: 'tickets', label: 'Data tickets', icon: Database },
  { id: 'history', label: 'Riwayat scraping', icon: History },
  { id: 'reports', label: 'Export reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  view: ViewId;
  onViewChange: (view: ViewId) => void;
  connected: boolean;
}

export function Sidebar({ view, onViewChange, connected }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { license, deactivate } = useLicense();

  useEffect(() => {
    setMobileOpen(false);
  }, [view]);

  return (
    <>
      <button
        type="button"
        className="fixed top-3 left-3 z-50 grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-foreground md:hidden"
        aria-label="Buka menu navigasi"
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        <span className="text-lg">{mobileOpen ? '✕' : '☰'}</span>
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-4 border-r border-sidebar-border p-3 transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Navigasi utama"
      >
        <div className="flex items-center gap-2 px-2 pt-6 md:pt-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
            S
          </span>
          <div className="flex flex-col">
            <strong className="text-sm font-semibold leading-tight">ScrapeChangeTicket</strong>
            <small className="text-muted-foreground text-xs">Automation</small>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Menu navigasi">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
                onClick={() => onViewChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border px-2 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                connected ? 'bg-primary' : 'bg-muted-foreground/50'
              )}
              aria-hidden="true"
            />
            <span>{connected ? 'Browser terhubung' : 'Browser belum dibuka'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-sidebar-border px-2 py-2">
          <p className="text-xs leading-snug">
            <span className="text-muted-foreground">Licensed to </span>
            <span className="font-medium">{license.owner || '-'}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => void deactivate()}
          >
            Deactivate
          </Button>
        </div>
      </aside>
    </>
  );
}
