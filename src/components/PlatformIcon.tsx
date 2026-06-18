import { cn } from '../lib/utils';

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  workana:    { bg: 'bg-gradient-to-br from-[#ff5d8f] to-[#a05bff]', text: 'text-white', label: 'W' },
  '99freelas':{ bg: 'bg-gradient-to-br from-[#22c55e] to-[#10b981]', text: 'text-white', label: '99' },
  freelancer: { bg: 'bg-gradient-to-br from-[#2388ff] to-[#0ea5e9]', text: 'text-white', label: '↗' },
  upwork:     { bg: 'bg-gradient-to-br from-[#14a800] to-[#22c55e]', text: 'text-white', label: 'Up' },
  remoteok:   { bg: 'bg-black', text: 'text-white', label: '◉' },
};

interface PlatformIconProps {
  platform: string;
  size?: number;
  className?: string;
}

export function PlatformIcon({ platform, size = 36, className }: PlatformIconProps) {
  const s = STYLES[platform] ?? { bg: 'bg-[#f1f1f5]', text: 'text-secondary', label: '?' };
  const fontSize = size >= 36 ? 13 : 11;
  return (
    <div
      className={cn('rounded-[10px] grid place-items-center font-bold tracking-tight', s.bg, s.text, className)}
      style={{ width: size, height: size, fontSize }}
    >
      {s.label}
    </div>
  );
}
