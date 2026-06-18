import { create } from 'zustand';
import { api } from '../ipc/api';
import type { PipelineOpportunity, TeamProgressEvent, TeamRunResult } from '../ipc/api';
import type {
  Agent, AgentRun, Opportunity, MonitoredSite, RadarTag, ActivityLog, DailySummary, AgentRunEvent,
} from '../types';

export interface AppNotification {
  id: number;
  type: 'agent_run' | 'scan' | 'opportunity' | 'error' | 'document' | 'team';
  title: string;
  description: string;
  timestamp: Date;
}

let _notifId = 0;

interface RadarState {
  agents: Agent[];
  runsByAgent: Record<number, AgentRun | undefined>; // last active run per agent
  // Oportunidades lidas SOMENTE dos JSON em {workspace}/freelas/ (fonte de
  // verdade), já filtradas pelo score mínimo e ordenadas por match.
  freelas: Opportunity[];
  // Limiar de match (%) efetivamente aplicado — vem das settings, com fallback.
  minMatchScore: number;
  sites: MonitoredSite[];
  tags: RadarTag[];
  activity: ActivityLog[];
  summary: DailySummary | null;
  loading: boolean;
  scanning: boolean;
  // Execução do time de agentes (pipeline/handoff).
  runningTeam: boolean;
  teamProgress: TeamProgressEvent | null;
  teamResult: TeamRunResult | null;
  // Notificações (últimas 5, mais recente primeiro).
  notifications: AppNotification[];
  unreadCount: number;

  loadAll: () => Promise<void>;
  refreshFreelas: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshSites: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  refreshTags: () => Promise<void>;
  scanNow: () => Promise<void>;
  runAgent: (agentId: number, opportunityId: number | null) => Promise<void>;
  runTeam: (opps: PipelineOpportunity[]) => Promise<void>;
  dismissTeamResult: () => void;
  handleRunEvent: (evt: AgentRunEvent) => void;
  pushNotification: (n: Pick<AppNotification, 'type' | 'title' | 'description'>) => void;
  markNotificationsRead: () => void;
}

// Limiar padrão (em %): só carregamos oportunidades cujo match seja MAIOR que
// ele. Configurável em Settings → Match Engine (chave `match.min_score`).
export const MIN_MATCH_SCORE_DEFAULT = 50;

// Ordena oportunidades por % de match (desc) e, em empate, pela mais recente.
function sortByMatch(opps: Opportunity[]): Opportunity[] {
  return [...opps].sort((a, b) => {
    const byScore = (b.match_score ?? 0) - (a.match_score ?? 0);
    if (byScore !== 0) return byScore;
    const av = a.found_at ? new Date(a.found_at as string).getTime() : 0;
    const bv = b.found_at ? new Date(b.found_at as string).getTime() : 0;
    return bv - av;
  });
}

export const useRadarStore = create<RadarState>((set, get) => ({
  agents: [],
  runsByAgent: {},
  freelas: [],
  minMatchScore: MIN_MATCH_SCORE_DEFAULT,
  sites: [],
  tags: [],
  activity: [],
  summary: null,
  loading: true,
  scanning: false,
  runningTeam: false,
  teamProgress: null,
  teamResult: null,
  notifications: [],
  unreadCount: 0,

  loadAll: async () => {
    set({ loading: true });
    // Oportunidades NÃO são carregadas do banco — vêm dos JSON via refreshFreelas.
    const [agents, sites, tags, activity, summary, activeRuns] = await Promise.all([
      api.agents.list(),
      api.sites.list(),
      api.tags.list(),
      api.activity.recent(10),
      api.summary.daily(),
      api.agents.runs(),
    ]);

    const runsByAgent: Record<number, AgentRun | undefined> = {};
    for (const r of activeRuns) {
      // prefer running, then most recent
      const existing = runsByAgent[r.agent_id];
      if (!existing) runsByAgent[r.agent_id] = r;
      else if (r.status === 'running' && existing.status !== 'running') runsByAgent[r.agent_id] = r;
    }

    set({ agents, sites, tags, activity, summary, runsByAgent, loading: false });
  },

  // Re-lê os JSONs em {workspace}/freelas/, mantém só os que passam do limiar
  // de match (configurável em Settings → Match Engine) e ordena por % de match.
  refreshFreelas: async () => {
    const [opps, minRow] = await Promise.all([
      api.opportunities.listFromFreelas(),
      api.settings.get('match.min_score'),
    ]);
    const parsed = minRow?.value != null && minRow.value !== '' ? Number(minRow.value) : NaN;
    const threshold = Number.isFinite(parsed) ? parsed : MIN_MATCH_SCORE_DEFAULT;
    const matched = (opps ?? []).filter((o) => (o.match_score ?? 0) > threshold);
    set({ freelas: sortByMatch(matched), minMatchScore: threshold });
  },

  refreshActivity: async () => {
    const activity = await api.activity.recent(10);
    set({ activity });
  },

  refreshSites: async () => {
    const sites = await api.sites.list();
    set({ sites });
  },

  refreshAgents: async () => {
    const agents = await api.agents.list();
    set({ agents });
  },

  refreshTags: async () => {
    const tags = await api.tags.list();
    set({ tags });
  },

  // Varredura = ler os JSONs em {workspace}/freelas/ e reclassificá-los pelo
  // % de match entre a descrição das vagas e as tags monitoradas, reordenando
  // a lista por match.
  scanNow: async () => {
    set({ scanning: true });
    try {
      await api.opportunities.rescore();
      await Promise.all([
        get().refreshFreelas(),
        get().refreshActivity(),
      ]);
      const count = get().freelas.length;
      get().pushNotification({
        type: 'scan',
        title: 'Varredura concluída',
        description: `${count} oportunidade${count !== 1 ? 's' : ''} encontrada${count !== 1 ? 's' : ''}`,
      });
    } finally {
      const EXTRA_MS = 10000;
      await new Promise((r) => setTimeout(r, EXTRA_MS));
      set({ scanning: false });
    }
  },

  runAgent: async (agentId, opportunityId) => {
    await api.agents.run(agentId, opportunityId);
    await get().refreshActivity();
  },

  // Executa o time de agentes (handoff) sobre as vagas selecionadas. Escuta os
  // eventos de progresso e guarda o resultado final pra UI exibir.
  runTeam: async (opps) => {
    if (get().runningTeam || opps.length === 0) return;
    set({ runningTeam: true, teamProgress: null, teamResult: null });
    const off = api.agents.onTeamEvent((evt) => set({ teamProgress: evt }));
    try {
      const result = await api.agents.runTeam(opps);
      set({ teamResult: result });
      get().pushNotification({
        type: 'team',
        title: result.ok ? 'Pipeline concluído' : 'Pipeline falhou',
        description: result.ok
          ? `${result.written.length} documento${result.written.length !== 1 ? 's' : ''} gerado${result.written.length !== 1 ? 's' : ''}`
          : result.errors[0] ?? 'Erro desconhecido',
      });
    } catch (e) {
      const msg = (e as Error).message;
      set({ teamResult: { ok: false, written: [], errors: [msg], dir: '' } });
      get().pushNotification({ type: 'error', title: 'Erro no pipeline', description: msg });
    } finally {
      off();
      set({ runningTeam: false });
      get().refreshActivity();
    }
  },

  dismissTeamResult: () => set({ teamResult: null, teamProgress: null }),

  pushNotification: (n) => {
    const notif: AppNotification = { ...n, id: ++_notifId, timestamp: new Date() };
    set((s) => ({
      notifications: [notif, ...s.notifications].slice(0, 5),
      unreadCount: s.unreadCount + 1,
    }));
  },

  markNotificationsRead: () => set({ unreadCount: 0 }),

  handleRunEvent: (evt: AgentRunEvent) => {
    const prev = get().runsByAgent[evt.agentId];
    const prevStatus = prev?.status;
    const merged: AgentRun = {
      id: evt.runId,
      agent_id: evt.agentId,
      opportunity_id: prev?.opportunity_id ?? null,
      status: evt.status ?? prev?.status ?? 'running',
      progress: typeof evt.progress === 'number' ? evt.progress : prev?.progress ?? 0,
      current_step: evt.current_step ?? prev?.current_step ?? '',
      next_step: evt.next_step ?? prev?.next_step ?? '',
      started_at: prev?.started_at ?? new Date(),
      completed_at: evt.status === 'completed' || evt.status === 'failed' ? new Date() : prev?.completed_at ?? null,
      logs: prev?.logs ?? '',
      error: evt.error ?? prev?.error ?? null,
    };
    set((state) => ({ runsByAgent: { ...state.runsByAgent, [evt.agentId]: merged } }));

    // Notifica em transições relevantes (início e fim).
    const agentName = get().agents.find((a) => a.id === evt.agentId)?.name ?? `Agente #${evt.agentId}`;
    if (evt.status === 'running' && prevStatus !== 'running') {
      get().pushNotification({ type: 'agent_run', title: `${agentName} iniciou`, description: evt.current_step ?? 'Executando...' });
    } else if (evt.status === 'completed') {
      get().pushNotification({ type: 'agent_run', title: `${agentName} concluiu`, description: 'Documento gerado com sucesso' });
    } else if (evt.status === 'failed') {
      get().pushNotification({ type: 'error', title: `${agentName} falhou`, description: evt.error ?? 'Erro desconhecido' });
    }
  },
}));
