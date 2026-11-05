import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TopbarProps {
  title: string;
  connected: boolean;
  onStartBrowser: () => void;
  onLogin: () => void;
}

export function Topbar({ title, connected, onStartBrowser, onLogin }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Pelindo operations</span>
        <span className="text-muted-foreground/50">/</span>
        <strong className="font-semibold">{title}</strong>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={connected ? 'default' : 'outline'} className="hidden sm:inline-flex">
          {connected ? 'Connected' : 'Offline'}
        </Badge>
        <Button variant="secondary" size="sm" onClick={onStartBrowser} className={cn('hidden md:inline-flex')}>
          Buka sesi
        </Button>
        <Button size="sm" onClick={onLogin}>
          Login ServiceNow
        </Button>
      </div>
    </header>
  );
}
