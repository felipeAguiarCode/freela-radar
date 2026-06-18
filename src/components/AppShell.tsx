import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { FirstRunModal } from './FirstRunModal';
import { ScanningModal } from './ScanningModal';
import { TeamRunModal } from './TeamRunModal';
import { RadarPage } from '../pages/RadarPage';
import { AgentsPage } from '../pages/AgentsPage';
import { PipelinePage } from '../pages/PipelinePage';
import { TasksPage } from '../pages/TasksPage';
import { ScrapperPage } from '../pages/ScrapperPage';
import { SettingsPage } from '../pages/SettingsPage';
import { api } from '../ipc/api';
import { useRadarStore } from '../store/useRadarStore';
import type { AppConfig } from '../types';

type Page = 'radar' | 'scrapper' | 'agentes' | 'pipeline' | 'tasks' | 'settings';

const SIDEBAR_STORAGE_KEY = 'free-hub:sidebar-collapsed';

function applyTheme(theme: string | undefined | null) {
  const resolved = theme === 'dio' ? 'dio' : 'light';
  document.documentElement.dataset.theme = resolved;
}

export function AppShell({ animateEntrance = true }: { animateEntrance?: boolean }) {
  const [page, setPage] = useState<Page>('radar');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [appConfig, setAppConfig] = useState<(AppConfig & { activeDbPath: string }) | null>(null);
  // ID do agente a pré-selecionar quando navegando para a aba "Agentes" via deep-link
  // (ex: clicar no botão de abrir editor num AgentCard do dashboard).
  const [pendingAgentId, setPendingAgentId] = useState<number | null>(null);

  const openAgentInEditor = (id: number) => {
    setPendingAgentId(id);
    setPage('agentes');
  };

  const navigate = (target: Page) => {
    // Sair de "agentes" reseta o pendingAgentId pra não disparar a seleção forçada
    // numa próxima visita orgânica via sidebar.
    if (target !== 'agentes') setPendingAgentId(null);
    setPage(target);
  };

  useEffect(() => {
    api.app.getConfig().then(setAppConfig);
    api.settings.get('general.theme').then((row) => applyTheme(row?.value));

    // Listeners globais de IPC — ficam aqui (sempre montado) e não no RadarPage
    // para que notificações e estado sejam capturados em qualquer aba.
    const offRun = api.agents.onRunEvent((evt) => {
      useRadarStore.getState().handleRunEvent(evt);
    });
    const offAct = api.activity.onEvent((entry: { type?: string; title?: string; description?: string }) => {
      const store = useRadarStore.getState();
      store.refreshActivity();
      if (entry && entry.title) {
        store.pushNotification({
          type: (entry.type ?? 'agent_run') as 'agent_run' | 'scan' | 'opportunity' | 'error' | 'document',
          title: entry.title,
          description: entry.description ?? '',
        });
      }
    });
    return () => { offRun(); offAct(); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const needsFirstRun = appConfig != null && !appConfig.configured;

  return (
    <div className="relative h-screen w-screen flex bg-page overflow-hidden">
      <Sidebar
        page={page}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        userName={appConfig?.userName}
        animateEntrance={animateEntrance}
      />
      {/* Toggle sidebar — fora do aside para não ser cortado pelo overflow-hidden */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        className="absolute top-9 w-6 h-6 rounded-full bg-white border border-border grid place-items-center text-secondary hover:text-primary hover:border-purple-ring shadow-sm app-no-drag z-[60] transition-all duration-200"
        style={{ left: sidebarCollapsed ? 60 : 236 }}
      >
        {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
      <main
        className="flex-1 flex flex-col min-w-0"
        style={animateEntrance ? { animation: 'fade-in-up 0.7s ease-out 0.3s both' } : { opacity: 0 }}
      >
        <TopBar />
        <div className="flex-1 min-h-0 overflow-hidden">
          {page === 'radar' && (
            <RadarPage onNavigate={navigate} onOpenAgent={openAgentInEditor} />
          )}
          {page === 'agentes' && <AgentsPage initialAgentId={pendingAgentId} />}
          {page === 'pipeline' && <PipelinePage />}
          {page === 'tasks' && <TasksPage />}
          {page === 'scrapper' && <ScrapperPage />}
          {page === 'settings' && (
            <SettingsPage
              onConfigChanged={() => api.app.getConfig().then(setAppConfig)}
              onThemeChange={(t) => applyTheme(t)}
            />
          )}
        </div>
      </main>

      {/* Overlay de carregamento durante a varredura */}
      <ScanningModal />

      {/* Overlay de progresso/resultado da execução do time de agentes */}
      <TeamRunModal />

      {needsFirstRun && appConfig && (
        <FirstRunModal
          initial={appConfig}
          onComplete={async (next) => {
            setAppConfig(next);
            if (next.dbPathChanged) {
              const ok = window.confirm(
                'O caminho do banco de dados foi alterado. O app precisa reiniciar para abrir o novo banco. Reiniciar agora?',
              );
              if (ok) await api.app.restart();
            }
          }}
        />
      )}
    </div>
  );
}
