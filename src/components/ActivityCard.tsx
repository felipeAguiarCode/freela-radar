import { FileText, Bot, ScanSearch, Megaphone, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { relativeTime } from '../lib/utils';
import type { ActivityLog } from '../types';

interface Props {
  items: ActivityLog[];
}

const TYPE_STYLE: Record<string, { bg: string; color: string; Icon: LucideIcon }> = {
  document:    { bg: 'bg-purple-soft',  color: 'text-purple',     Icon: FileText },
  opportunity: { bg: 'bg-green-soft',   color: 'text-[#16a34a]',  Icon: ScanSearch },
  agent_run:   { bg: 'bg-blue-soft',    color: 'text-blue',       Icon: Bot },
  proposal:    { bg: 'bg-green-soft',   color: 'text-[#16a34a]',  Icon: Megaphone },
  error:       { bg: 'bg-[#fee2e2]',    color: 'text-rose',       Icon: AlertTriangle },
  scan:        { bg: 'bg-green-soft',   color: 'text-[#16a34a]',  Icon: CheckCircle2 },
};

export function ActivityCard({ items }: Props) {
  return (
    <section className="bg-card rounded-2xl border border-border p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-primary">Atividade recente</h3>
        <button className="text-[12px] font-medium text-purple hover:opacity-80">Ver tudo</button>
      </div>
      <ul className="space-y-4">
        {items.map((it) => {
          const style = TYPE_STYLE[it.type] ?? TYPE_STYLE.agent_run;
          const Icon = style.Icon;
          return (
            <li key={it.id} className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${style.bg}`}>
                <Icon size={16} className={style.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold text-primary truncate">{it.title}</div>
                <div className="text-[12.5px] text-secondary truncate">{it.description}</div>
              </div>
              <span className="text-[12px] text-muted tabular-nums whitespace-nowrap">{relativeTime(it.created_at)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
