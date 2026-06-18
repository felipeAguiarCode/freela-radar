import { useEffect, useRef, useState } from 'react';
import { Bell, Bot, CheckCircle2, FileText, Play, ScanSearch, Search, AlertTriangle, Users } from 'lucide-react';
import { useRadarStore } from '../store/useRadarStore';
import type { AppNotification } from '../store/useRadarStore';
import { cn } from '../lib/utils';
import { relativeTime } from '../lib/utils';
import { TrafficLights } from './TrafficLights';

const NOTIF_STYLE: Record<string, { bg: string; color: string; Icon: typeof Bell }> = {
  scan:        { bg: 'bg-green-soft',   color: 'text-[#16a34a]', Icon: CheckCircle2 },
  agent_run:   { bg: 'bg-blue-soft',    color: 'text-blue',      Icon: Bot },
  opportunity: { bg: 'bg-green-soft',   color: 'text-[#16a34a]', Icon: ScanSearch },
  document:    { bg: 'bg-purple-soft',  color: 'text-purple',    Icon: FileText },
  error:       { bg: 'bg-[#fee2e2]',    color: 'text-rose',      Icon: AlertTriangle },
  team:        { bg: 'bg-purple-soft',  color: 'text-purple',    Icon: Users },
};

function NotificationItem({ n }: { n: AppNotification }) {
  const style = NOTIF_STYLE[n.type] ?? NOTIF_STYLE.agent_run;
  const Icon = style.Icon;
  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-[#f8f8fb] transition">
      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${style.bg}`}>
        <Icon size={14} className={style.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-primary truncate">{n.title}</div>
        <div className="text-[12px] text-secondary truncate">{n.description}</div>
      </div>
      <span className="text-[11px] text-muted whitespace-nowrap tabular-nums mt-0.5">
        {relativeTime(n.timestamp)}
      </span>
    </li>
  );
}

export function TopBar() {
  const scanning = useRadarStore((s) => s.scanning);
  const scanNow = useRadarStore((s) => s.scanNow);
  const notifications = useRadarStore((s) => s.notifications);
  const unreadCount = useRadarStore((s) => s.unreadCount);
  const markRead = useRadarStore((s) => s.markNotificationsRead);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markRead();
  };

  return (
    <header className="relative h-[88px] bg-white border-b border-border pl-8 pr-24 flex items-center justify-between app-drag">
      {/* Ação principal — varredura (à esquerda da navbar) */}
      <div className="flex items-center app-no-drag">
        <button
          onClick={() => scanNow()}
          disabled={scanning}
          title="Lê os JSONs e reclassifica as vagas pelo % de match com as tags monitoradas"
          className={cn(
            'h-[44px] px-4 rounded-xl border border-border bg-white text-[14px] font-medium text-primary',
            'flex items-center gap-2 hover:bg-[#f8f8fb] transition shadow-card disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          <Play size={16} className={cn('text-primary', scanning && 'animate-pulse')} fill="currentColor" />
          <span>{scanning ? 'Varrendo…' : 'Executar varredura agora'}</span>
        </button>
      </div>

      {/* Right cluster — busca + notificações */}
      <div className="flex items-center gap-3 app-no-drag">
        {/* Search */}
        <div className="h-[44px] w-[360px] rounded-xl border border-border bg-white flex items-center gap-2 px-3 shadow-card">
          <Search size={16} className="text-muted" />
          <input
            placeholder="Buscar oportunidades..."
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted"
          />
          <kbd className="text-[11px] font-medium text-muted bg-[#f5f5f7] border border-border rounded-md px-1.5 py-0.5">⌘K</kbd>
        </div>

        {/* Bell + dropdown */}
        <div ref={panelRef} className="relative">
          <button
            onClick={toggle}
            className="relative h-[44px] w-[44px] rounded-xl border border-border bg-white grid place-items-center hover:bg-[#f8f8fb] transition shadow-card"
          >
            <Bell size={18} className="text-primary" />
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose" />
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-[52px] w-[380px] bg-white rounded-2xl border border-border shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-primary">Notificações</h4>
                {notifications.length > 0 && (
                  <span className="text-[11.5px] text-muted">
                    Últimas {notifications.length}
                  </span>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-muted">
                  Nenhuma notificação ainda
                </div>
              ) : (
                <ul className="max-h-[320px] overflow-y-auto divide-y divide-border">
                  {notifications.map((n) => (
                    <NotificationItem key={n.id} n={n} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <TrafficLights />
    </header>
  );
}
