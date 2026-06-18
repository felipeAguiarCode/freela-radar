import type {
  Agent, AgentTool, MonitoredSite, RadarTag, Opportunity,
  AgentRun, ActivityLog, DailySummary, AgentRunEvent, AppConfig,
} from '../types';

/** Vaga mínima enviada ao pipeline do time (origem: JSON em freelas/). */
export interface PipelineOpportunity {
  id: number;
  title: string;
  description?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  detected_tags?: string | string[] | null;
  source_url?: string | null;
}

/** Evento de progresso da execução do time de agentes. */
export interface TeamProgressEvent {
  type: 'opp-start' | 'agent-start' | 'agent-done' | 'opp-done' | 'done' | 'error';
  oppIndex?: number;
  oppTotal?: number;
  oppTitle?: string;
  agentIndex?: number;
  agentTotal?: number;
  agentName?: string;
  agentIcon?: string;
  filePath?: string;
  error?: string;
}

export interface TeamRunResult {
  ok: boolean;
  written: string[];
  errors: string[];
  dir: string;
}

/** Opções para iniciar a raspagem do Workana. */
export interface ScrapperOptions {
  url: string;
  pages: number;
  headless?: boolean;
  /** Pausa mínima (ms) entre a leitura de uma vaga e a próxima (anti-spam). */
  delayMinMs?: number;
  /** Pausa máxima (ms) — o tempo real é sorteado entre min e max a cada vaga. */
  delayMaxMs?: number;
}

/** Vaga resumida exibida no log em tempo real. */
export interface ScrapperJob {
  title: string;
  url: string;
  budget: string | null;
  tags: string[];
}

/** Evento de progresso (streaming) emitido durante a raspagem. */
export interface ScrapperEvent {
  type: 'start' | 'page' | 'job' | 'log' | 'done' | 'error' | 'cancelled';
  page?: number;
  totalPages?: number;
  jobsOnPage?: number;
  totalJobs?: number;
  savedJobs?: number;
  job?: ScrapperJob;
  message?: string;
  level?: 'info' | 'success' | 'warn' | 'error';
  error?: string;
  dir?: string;
  filePath?: string;
}

/** Resultado final da raspagem. */
export interface ScrapperResult {
  ok: boolean;
  totalJobs: number;
  savedJobs: number;
  dir: string;
  error?: string;
}

interface FreelaApi {
  agents: {
    list: () => Promise<Agent[]>;
    get: (id: number) => Promise<Agent | undefined>;
    create: (data: Partial<Agent>) => Promise<Agent>;
    update: (id: number, patch: Partial<Agent>) => Promise<Agent>;
    delete: (id: number) => Promise<boolean>;
    reorder: (orderedIds: number[]) => Promise<boolean>;
    listTools: (id: number) => Promise<AgentTool[]>;
    setTool: (id: number, name: string, enabled: boolean) => Promise<boolean>;
    run: (id: number, opportunityId: number | null) => Promise<number | null>;
    cancel: (runId: number) => Promise<boolean>;
    cancelAll: () => Promise<number>;
    clearRuns: () => Promise<number>;
    openExecutionsDir: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    activeRuns: () => Promise<AgentRun[]>;
    runs: (agentId?: number) => Promise<AgentRun[]>;
    artifacts: (runId: number) => Promise<Array<{ id: number; agent_run_id: number; type: string; title: string; content: string }>>;
    onRunEvent: (cb: (evt: AgentRunEvent) => void) => () => void;
    runTeam: (opps: PipelineOpportunity[]) => Promise<TeamRunResult>;
    onTeamEvent: (cb: (evt: TeamProgressEvent) => void) => () => void;
    importTeam: (agents: Array<Record<string, unknown>>) => Promise<{ ok: boolean; created: Agent[]; count: number }>;
  };
  opportunities: {
    list: (opts?: { limit?: number }) => Promise<Opportunity[]>;
    get: (id: number) => Promise<Opportunity | undefined>;
    listFromFreelas: (opts?: { limit?: number }) => Promise<Opportunity[]>;
    rescore: () => Promise<{
      ok: boolean;
      total: number;
      topScore: number;
      durationMs: number;
      error?: string;
    }>;
    openJson: (id: number) => Promise<{ ok: boolean; path?: string; error?: string }>;
    openFreelasDir: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  sites: {
    list: () => Promise<MonitoredSite[]>;
    create: (data: Partial<MonitoredSite>) => Promise<MonitoredSite>;
    update: (id: number, patch: Partial<MonitoredSite>) => Promise<MonitoredSite>;
    delete: (id: number) => Promise<boolean>;
    scanNow: (slug?: string) => Promise<{ site: string; found: number; inserted: number; durationMs: number }>;
  };
  scrapper: {
    start: (opts: ScrapperOptions) => Promise<ScrapperResult>;
    cancel: () => Promise<boolean>;
    onEvent: (cb: (evt: ScrapperEvent) => void) => () => void;
  };
  tags: {
    list: () => Promise<RadarTag[]>;
    create: (name: string) => Promise<RadarTag>;
    update: (id: number, patch: Partial<RadarTag>) => Promise<boolean>;
    delete: (id: number) => Promise<boolean>;
  };
  settings: {
    getAll: () => Promise<Array<{ id: number; key: string; value: string }>>;
    get: (key: string) => Promise<{ key: string; value: string } | undefined>;
    set: (key: string, value: string) => Promise<boolean>;
  };
  activity: {
    recent: (limit?: number) => Promise<ActivityLog[]>;
    onEvent: (cb: (evt: ActivityLog) => void) => () => void;
  };
  summary: {
    daily: () => Promise<DailySummary>;
  };
  system: {
    window: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
    ready: () => Promise<boolean>;
  };
  app: {
    getConfig: () => Promise<AppConfig & { activeDbPath: string }>;
    setConfig: (patch: Partial<AppConfig>) => Promise<AppConfig & { activeDbPath: string; dbPathChanged: boolean }>;
    createDb: (opts?: { defaultPath?: string; title?: string }) => Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }>;
    pickFile: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>;
    pickDirectory: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>;
    restart: () => Promise<void>;
    showItemInFolder: (fullPath: string) => Promise<boolean>;
    openPath: (fullPath: string) => Promise<string>;
    openWorkspaceDir: (name: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
}

declare global {
  interface Window {
    api: FreelaApi;
  }
}

export const api = window.api;
