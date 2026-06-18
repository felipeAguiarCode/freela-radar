import { cn } from '../lib/utils';

interface StatusBadgeProps {
  variant: 'active' | 'paused' | 'error' | 'ok';
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: 'bg-green-soft', text: 'text-[#16a34a]', dot: 'bg-green' },
    paused: { bg: 'bg-amber-soft', text: 'text-amber', dot: 'bg-amber' },
    error:  { bg: 'bg-[#fee2e2]', text: 'text-rose', dot: 'bg-rose' },
    ok:     { bg: 'bg-green-soft', text: 'text-[#16a34a]', dot: 'bg-green' },
  };
  const s = map[variant];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium', s.bg, s.text, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {children}
    </span>
  );
}
