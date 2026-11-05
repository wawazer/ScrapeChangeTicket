import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'accent' | 'success' | 'danger' | 'amber';

const ICON_TONES: Record<Tone, string> = {
  accent: 'bg-primary/10 text-primary',
  success: 'bg-[oklch(20%_0.04_150)] text-[oklch(80%_0.16_150)]',
  danger: 'bg-[oklch(20%_0.06_25)] text-[oklch(78%_0.16_25)]',
  amber: 'bg-[oklch(22%_0.05_75)] text-[oklch(82%_0.14_75)]',
};

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
}

export function MetricCard({ label, value, hint, icon, tone = 'accent' }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          {icon && (
            <span className={cn('grid h-8 w-8 place-items-center rounded-md', ICON_TONES[tone])}>
              {icon}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
        </div>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  );
}
