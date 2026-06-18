import {
  Radar,
  Bot,
  ListChecks,
  Settings as SettingsIcon,
  Workflow,
  ScanLine,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

type Page = 'radar' | 'scrapper' | 'agentes' | 'pipeline' | 'tasks' | 'settings';

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  userName?: string;
  animateEntrance?: boolean;
}

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Estrutura da navegação principal — itens com separadores nomeados entre seções.
type NavEntry =
  | { type: 'item'; key: Page; label: string; icon: LucideIcon }
  | { type: 'separator'; label: string };

const NAV_ENTRIES: NavEntry[] = [
  { type: 'item', key: 'radar', label: 'Radar', icon: Radar },
  { type: 'separator', label: 'scrapping' },
  { type: 'item', key: 'scrapper', label: 'Scrapper', icon: ScanLine },
  { type: 'separator', label: 'agentes' },
  { type: 'item', key: 'agentes', label: 'Studio', icon: Bot },
  { type: 'item', key: 'pipeline', label: 'Pipeline', icon: Workflow },
  { type: 'item', key: 'tasks', label: 'Tasks', icon: ListChecks },
];

export function Sidebar({ page, onNavigate, collapsed, onToggle, userName, animateEntrance }: SidebarProps) {
  const displayName = userName?.trim() || 'Configurar nome';
  const initials = getInitials(userName);

  let navItemIndex = 0;

  const renderItem = (key: Page, label: string, Icon: LucideIcon) => {
    const active = page === key;
    const idx = navItemIndex++;
    return (
      <button
        key={key}
        onClick={() => onNavigate(key)}
        title={collapsed ? label : undefined}
        className={cn(
          'w-full flex items-center gap-3 h-[52px] rounded-xl text-[15px] transition-all app-no-drag',
          collapsed ? 'justify-center px-0' : 'px-4',
          active
            ? 'bg-purple-soft text-purple font-semibold'
            : 'text-primary/80 hover:bg-[#f5f5f7]',
          animateEntrance && 'animate-fade-in-down',
        )}
        style={animateEntrance ? { animationDelay: `${0.25 + idx * 0.07}s` } : undefined}
      >
        <Icon size={20} className={active ? 'text-purple' : 'text-[#667085]'} strokeWidth={active ? 2.4 : 2} />
        {!collapsed && <span className="whitespace-nowrap">{label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'shrink-0 h-full bg-white border-r border-border flex flex-col transition-[width] duration-200 ease-out relative',
        collapsed ? 'w-[72px]' : 'w-[248px]',
        animateEntrance && 'animate-slide-in-left',
      )}
      style={animateEntrance ? undefined : { opacity: 0 }}
    >
      {/* Toggle — renderizado pelo AppShell fora do aside para não ser cortado por overflow */}

      {/* Logo */}
      <div
        className={cn(
          'pt-8 pb-6 flex items-center gap-3 app-no-drag',
          collapsed ? 'px-4 justify-center' : 'px-7',
        )}
      >
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #6d4aff, #8a6bff)' }}
        >
          <Radar size={18} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span className="text-[17px] font-semibold text-primary tracking-tight whitespace-nowrap overflow-hidden">
            Freela Radar
          </span>
        )}
      </div>

      {/* Nav principal com separadores nomeados entre seções */}
      <nav className={cn('pt-4 flex flex-col gap-1', collapsed ? 'px-3' : 'px-4')}>
        {NAV_ENTRIES.map((entry, idx) => {
          if (entry.type === 'item') {
            return renderItem(entry.key, entry.label, entry.icon);
          }
          // Separator
          if (collapsed) {
            return (
              <div key={`sep-${idx}`} className="my-2 h-px bg-border mx-2" aria-hidden="true" />
            );
          }
          return (
            <div
              key={`sep-${idx}`}
              className="flex items-center gap-2 mt-3 mb-1 px-3 select-none"
              aria-hidden="true"
            >
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted whitespace-nowrap">
                {entry.label}
              </span>
              <span className="flex-1 h-px bg-border" />
            </div>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Settings fixado no bottom, acima do user footer */}
      <div className={cn('pb-2 app-no-drag', collapsed ? 'px-3' : 'px-4')}>
        {renderItem('settings', 'Settings', SettingsIcon)}
      </div>

      {/* User footer */}
      <div className={cn('pb-5 app-no-drag', collapsed ? 'px-3' : 'px-5')}>
        <div
          className={cn(
            'flex items-center gap-3 py-2 rounded-xl hover:bg-[#f7f7fb] transition',
            collapsed ? 'justify-center px-0' : 'px-2',
          )}
          title={collapsed ? `${displayName} — Pro` : undefined}
        >
          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-[#cdb5ff] to-[#7c5cff] grid place-items-center text-white text-xs font-semibold">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-primary truncate">{displayName}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple bg-purple-soft px-1.5 py-0.5 rounded-md">
                  Pro
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                <span className="text-[12px] text-secondary">Dados locais</span>
                <span className="text-[11px] text-muted">SQLite</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
