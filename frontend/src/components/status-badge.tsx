import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusLabel } from '@/lib/format';

const TONE_CLASSES: Record<string, string> = {
  success: 'border-transparent bg-[oklch(20%_0.04_150)] text-[oklch(80%_0.16_150)]',
  failed: 'border-transparent bg-[oklch(20%_0.06_25)] text-[oklch(78%_0.16_25)]',
  warning: 'border-transparent bg-[oklch(22%_0.05_75)] text-[oklch(82%_0.14_75)]',
  running: 'border-transparent bg-[oklch(22%_0.05_75)] text-[oklch(82%_0.14_75)]',
  reading: 'border-transparent bg-[oklch(22%_0.05_75)] text-[oklch(82%_0.14_75)]',
  starting: 'border-transparent bg-[oklch(22%_0.05_75)]  text-[oklch(82%_0.14_75)]',
  paused: 'border-transparent bg-[oklch(22%_0.05_75)] text-[oklch(82%_0.14_75)]',
  error: 'border-transparent bg-[oklch(20%_0.06_25)] text-[oklch(78%_0.16_25)]',
  cancelled: 'border-transparent bg-[oklch(20%_0.06_25)] text-[oklch(78%_0.16_25)]',
};

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  const tone = TONE_CLASSES[status ?? ''];
  return (
    <Badge variant="outline" className={cn(!tone && 'text-muted-foreground', tone, className)}>
      {statusLabel(status)}
    </Badge>
  );
}
