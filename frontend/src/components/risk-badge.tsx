import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LEVELS = {
  low: { text: 'Rendah', color: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30' },
  medium: { text: 'Sedang', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
  high: { text: 'Tinggi', color: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30' },
};

export function RiskBadge({ level, className }: { level: 'low' | 'medium' | 'high'; className?: string }) {
  const style = LEVELS[level];
  return (
    <Badge variant="outline" className={cn(style.color, className)}>
      {style.text}
    </Badge>
  );
}
