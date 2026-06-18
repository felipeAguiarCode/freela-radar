import { cn } from '../lib/utils';

interface TagChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  variant?: 'purple' | 'neutral' | 'green' | 'amber';
  className?: string;
}

export function TagChip({ children, onClick, variant = 'purple', className }: TagChipProps) {
  const variants: Record<string, string> = {
    purple: 'bg-purple-softer text-purple border-purple-ring',
    neutral: 'bg-white text-secondary border-border',
    green: 'bg-green-soft text-[#16a34a] border-[#bbf7d0]',
    amber: 'bg-amber-soft text-amber border-[#fde68a]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center h-[28px] px-3 rounded-full border text-[13px] font-medium transition',
        'hover:shadow-sm cursor-default',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
