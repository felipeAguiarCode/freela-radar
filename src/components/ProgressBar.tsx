import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  color?: 'purple' | 'blue' | 'green';
  className?: string;
}

const COLORS: Record<string, string> = {
  purple: 'bg-purple',
  blue: 'bg-blue',
  green: 'bg-green',
};

export function ProgressBar({ value, color = 'purple', className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('h-[5px] w-full bg-[#eceaf3] rounded-full overflow-hidden', className)}>
      <motion.div
        className={cn('h-full rounded-full', COLORS[color])}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}
