import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Loader2, CheckCircle2, XCircle, AlertCircle, Clock, X, FileText, FolderOpen, ExternalLink, Square, Trash2, List, KanbanSquare } from 'lucide-react';
import { api } from '../ipc/api';
import { cn, formatDateTime, relativeTime } from '../lib/utils';
import { BotAvatar } from '../components/BotAvatar';
import type { Agent, AgentRun, AgentRunEvent } from '../types';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled' | 'queued';
type ViewMode = 'list' | 'kanban';

const VIEW_STORAGE_KEY = 'free-hub:tasks-view-mode';

interface KanbanColumn {
  key: string;
  label: string;
  statuses: string[];
  dotClass: string;
  headerClass: string;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'queued',    label: 'Na fila',      statuses: ['queued'],    dotClass: 'bg-[#d98b00]', headerClass: 'text-[#d98b00]' },
  { key: 'running',   label: 'Em execução',  statuses: ['running'],   dotClass: 'bg-blue',      headerClass: 'text-blue' },
  { key: 'completed', label: 'Concluído',    statuses: ['completed'], dotClass: 'bg-green',     headerClass: 'text-[#16a34a]' },
  { key: 'failed',    label: 'Falhou',       statuses: ['failed'],    dotClass: 'bg-[#dc2626]', headerClass: 'text-[#dc2626]' },
  { key: 'cancelled', label: 'Cancelado',    statuses: ['cancelled'], dotClass: 'bg-[#cdcdd6]', headerClass: 'text-secondary' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  running:   { bg: 'bg-blue-soft',   text: 'text-blue',       dot: 'bg-blue',       label: 'Em execução' },
  queued:    { bg: 'bg-[#fff7e6]',   text: 'text-[#d98b00]',  dot: 'bg-[#d98b00]',  label: 'Na fila' },
  completed: { bg: 'bg-green-soft',  text: 'text-[#16a34a]',  dot: 'bg-green',      label: 'Concluído' },
  failed:    { bg: 'bg-[#fdf2f2]',   text: 'text-[#dc2626]',  dot: 'bg-[#dc2626]',  label: 'Falhou' },
  cancelled: { bg: 'bg-[#f1f1f4]',   text: 'text-secondary',  dot: 'bg-[#cdcdd6]',  label: 'Cancelado' },
};

export function TasksPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [artifactPaths, setArtifactPaths] = useState<Record<number, string | undefined>>({});
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [tick, setTick] = useState(0); // re-render leve pra atualizar `há X seg`
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'list';
    } catch {
      return 'list';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  // Carrega o workspace pra saber onde abrir a pasta executions
  useEffect(() => {
    api.app.getConfig().then((cfg) => setWorkspacePath(cfg.workspacePath));
  }, []);

  // Carga inicial
  useEffect(() => {
    Promise.all([api.agents.runs(), api.agents.list()]).then(([r, a]) => {
      setRuns(r);
      setAgents(a);
      // Para runs já concluídos, busca o caminho do artefato gravado
      for (const run of r) {
        if (run.status === 'completed') {
          api.agents.artifacts(run.id).then((arts) => {
            for (const art of arts) {
              try {
                const meta = JSON.parse((art as unknown as { metadata_json?: string }).metadata_json ?? '{}');
                if (meta?.filePath) {
                  setArtifactPaths((prev) => ({ ...prev, [run.id]: meta.filePath as string }));
                  break;
                }
              } catch {
                /* ignore */
              }
            }
          });
        }
      }
    });
  }, []);

  // Atualiza relativeTime a cada 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Stream de eventos do orquestrador — insere/atualiza linhas em tempo real
  useEffect(() => {
    const off = api.agents.onRunEvent((evt: AgentRunEvent) => {
      setRuns((prev) => {
        const existing = prev.find((r) => r.id === evt.runId);
        if (existing) {
          return prev.map((r) =>
            r.id === evt.runId
              ? {
                  ...r,
                  status: evt.status ?? r.status,
                  progress: typeof evt.progress === 'number' ? evt.progress : r.progress,
                  current_step: evt.current_step ?? r.current_step,
                  next_step: evt.next_step ?? r.next_step,
                  error: evt.error ?? r.error,
                  completed_at:
                    evt.status === 'completed' || evt.status === 'failed' || evt.status === 'cancelled'
                      ? new Date()
                      : r.completed_at,
                }
              : r,
          );
        }
        // Run novo (primeiro evento) — busca a row completa do banco em background.
        // Insere uma versão otimista pra UI já mostrar.
        return [
          {
            id: evt.runId,
            agent_id: evt.agentId,
            opportunity_id: null,
            status: evt.status ?? 'running',
            progress: evt.progress ?? 0,
            current_step: evt.current_step ?? '—',
            next_step: evt.next_step ?? '',
            started_at: new Date(),
            completed_at: null,
            logs: '',
            error: evt.error ?? null,
          } as AgentRun,
          ...prev,
        ];
      });
      if (evt.outputFilePath) {
        setArtifactPaths((prev) => ({ ...prev, [evt.runId]: evt.outputFilePath }));
      }
    });
    return off;
  }, []);

  const agentMap = useMemo(() => {
    const m = new Map<number, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    const base = filter === 'all' ? runs : runs.filter((r) => r.status === filter);
    // Mais recentes no topo — ordena por id desc (id é AUTOINCREMENT, então
    // reflete ordem cronológica de criação independente do clock drift).
    return [...base].sort((a, b) => b.id - a.id);
  }, [runs, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: runs.length, running: 0, queued: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const r of runs) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [runs]);

  const openExecutionsFolder = async () => {
    try {
      const result = await api.agents.openExecutionsDir();
      if (!result?.ok) {
        window.alert(
          `Não foi possível abrir a pasta executions.\n${result?.error ?? 'erro desconhecido'}\n\n` +
            (result?.path ? `Path tentado: ${result.path}` : 'Verifique se o workspace está configurado em Settings.'),
        );
      }
    } catch (e) {
      window.alert(
        `Handler IPC não disponível: ${String((e as Error).message ?? e)}\n\n` +
          'Feche e reabra o app para carregar os novos handlers.',
      );
    }
  };

  const cancelAll = async () => {
    const running = runs.filter((r) => r.status === 'running' || r.status === 'queued');
    if (running.length === 0) return;
    if (!window.confirm(`Cancelar ${running.length} execução(ões) ativa(s)?`)) return;
    // Otimista — UI reflete imediatamente
    setRuns((prev) =>
      prev.map((r) =>
        r.status === 'running' || r.status === 'queued'
          ? { ...r, status: 'cancelled', current_step: 'Cancelado', completed_at: new Date() }
          : r,
      ),
    );
    try {
      await api.agents.cancelAll();
    } catch (e) {
      console.error('[TasksPage] cancelAll falhou', e);
      window.alert(`Falha ao cancelar: ${String((e as Error).message ?? e)}`);
    }
  };

  const clearRuns = async () => {
    if (runs.length === 0) return;
    const ok = window.confirm(
      `Apagar histórico completo (${runs.length} execução(ões))?\n\n` +
        `Isso remove os registros do banco. Os arquivos em executions/ permanecem em disco — apague manualmente se quiser.`,
    );
    if (!ok) return;
    try {
      const removed = await api.agents.clearRuns();
      console.log(`[TasksPage] clearRuns removeu ${removed} runs`);
      setRuns([]);
      setArtifactPaths({});
    } catch (e) {
      console.error('[TasksPage] clearRuns falhou', e);
      window.alert(
        `Falha ao limpar: ${String((e as Error).message ?? e)}\n\n` +
          'Se o erro for "No handler registered", feche e reabra o app.',
      );
    }
  };

  const cancelRun = async (runId: number) => {
    // Atualização otimista — UI reflete imediatamente; se o backend confirmar,
    // o event chega depois com o mesmo status (idempotente).
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? { ...r, status: 'cancelled', current_step: 'Cancelado', completed_at: new Date() }
          : r,
      ),
    );
    try {
      await api.agents.cancel(runId);
    } catch (e) {
      console.error('[TasksPage] cancel falhou', e);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-7">
        <header className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-soft text-purple grid place-items-center shrink-0">
              <ListChecks size={18} strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-primary leading-tight">Tasks</h1>
              <p className="text-[13px] text-secondary mt-0.5">
                Histórico em tempo real das execuções dos agentes — sucesso, erro e progresso.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Toggle de view (lista | kanban) */}
            <div className="inline-flex items-center bg-white border border-border rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Visualizar como lista"
                aria-label="Visualizar como lista"
                className={cn(
                  'h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition',
                  viewMode === 'list' ? 'bg-purple-soft text-purple' : 'text-secondary hover:text-primary',
                )}
              >
                <List size={13} />
                Lista
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                title="Visualizar como kanban"
                aria-label="Visualizar como kanban"
                className={cn(
                  'h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition',
                  viewMode === 'kanban' ? 'bg-purple-soft text-purple' : 'text-secondary hover:text-primary',
                )}
              >
                <KanbanSquare size={13} />
                Kanban
              </button>
            </div>
            {/* Ações rápidas — só ícone */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openExecutionsFolder}
                title="Abrir pasta executions"
                aria-label="Abrir pasta executions"
                className="w-9 h-9 rounded-lg border border-border bg-white grid place-items-center text-primary hover:bg-[#f8f8fb] transition"
              >
                <FolderOpen size={15} />
              </button>
              <button
                type="button"
                onClick={cancelAll}
                disabled={(counts.running ?? 0) + (counts.queued ?? 0) === 0}
                title="Cancelar todas as execuções ativas"
                aria-label="Cancelar todas"
                className="w-9 h-9 rounded-lg border border-border bg-white grid place-items-center text-[#b91c1c] hover:bg-[#fdf2f2] hover:border-[#f3c2c2] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Square size={14} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={clearRuns}
                disabled={runs.length === 0}
                title="Limpar histórico de execuções"
                aria-label="Limpar histórico"
                className="w-9 h-9 rounded-lg border border-border bg-white grid place-items-center text-primary hover:bg-[#f8f8fb] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {/* Contadores */}
            <div className="flex items-center gap-2 text-[12px] text-secondary">
              <span className="inline-flex items-center gap-1.5">
                {(counts.running ?? 0) > 0 && <Loader2 size={12} className="text-blue animate-spin" />}
                {counts.running ?? 0} em execução
              </span>
              <span>·</span>
              <span>{runs.length} total</span>
            </div>
          </div>
        </header>

        {/* Filtros — só no modo lista (no kanban cada coluna já é um filtro) */}
        {viewMode === 'list' && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['all', 'running', 'queued', 'completed', 'failed', 'cancelled'] as StatusFilter[]).map((f) => {
            const active = filter === f;
            const labels: Record<StatusFilter, string> = {
              all: 'Todos', running: 'Em execução', queued: 'Na fila',
              completed: 'Concluídos', failed: 'Falhas', cancelled: 'Cancelados',
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-8 px-3 rounded-full text-[12.5px] font-medium border transition',
                  active
                    ? 'bg-purple text-white border-purple'
                    : 'bg-white text-primary border-border hover:bg-[#f7f7fb]',
                )}
              >
                {labels[f]} <span className={cn('ml-1', active ? 'opacity-80' : 'text-muted')}>·</span>{' '}
                <span className={cn(active ? 'opacity-90' : 'text-secondary')}>{counts[f] ?? 0}</span>
              </button>
            );
          })}
        </div>
        )}

        {/* Lista */}
        {viewMode === 'list' && (
          filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center text-secondary">
              <ListChecks size={32} className="mx-auto mb-3 text-muted" />
              <p className="text-[14px]">
                {runs.length === 0
                  ? 'Nenhuma execução ainda. Clique no play verde de um agente para começar.'
                  : 'Nenhum task com esse filtro.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2" key={tick}>
              {filtered.map((run) => (
                <TaskRow
                  key={run.id}
                  run={run}
                  agent={agentMap.get(run.agent_id)}
                  artifactPath={artifactPaths[run.id]}
                  onCancel={() => cancelRun(run.id)}
                />
              ))}
            </ul>
          )
        )}

        {/* Kanban */}
        {viewMode === 'kanban' && (
          runs.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center text-secondary">
              <KanbanSquare size={32} className="mx-auto mb-3 text-muted" />
              <p className="text-[14px]">Nenhuma execução ainda.</p>
            </div>
          ) : (
            <div
              className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 h-[calc(100vh-180px)]"
              key={tick}
            >
              {KANBAN_COLUMNS.map((col) => {
                const colRuns = runs
                  .filter((r) => col.statuses.includes(r.status))
                  .sort((a, b) => b.id - a.id);
                return (
                  <div
                    key={col.key}
                    className="shrink-0 w-72 bg-[#f1f1f4] rounded-2xl p-3 flex flex-col h-full"
                  >
                    <header className="flex items-center justify-between mb-3 px-1 shrink-0">
                      <h3 className={cn('text-[13px] font-semibold flex items-center gap-1.5', col.headerClass)}>
                        <span className={cn('w-2 h-2 rounded-full', col.dotClass)} />
                        {col.label}
                      </h3>
                      <span className="text-[12px] text-muted tabular-nums">{colRuns.length}</span>
                    </header>
                    <div className="space-y-2 overflow-y-auto flex-1 min-h-[40px]">
                      {colRuns.length === 0 ? (
                        <div className="text-[12px] text-muted text-center py-6 italic">vazio</div>
                      ) : (
                        colRuns.map((run) => (
                          <KanbanCard
                            key={run.id}
                            run={run}
                            agent={agentMap.get(run.agent_id)}
                            artifactPath={artifactPaths[run.id]}
                            onCancel={() => cancelRun(run.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function TaskRow({
  run,
  agent,
  artifactPath,
  onCancel,
}: {
  run: AgentRun;
  agent: Agent | undefined;
  artifactPath: string | undefined;
  onCancel: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const style = STATUS_STYLES[run.status] ?? STATUS_STYLES.queued;
  const isRunning = run.status === 'running' || run.status === 'queued';
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const StatusIcon =
    run.status === 'completed' ? CheckCircle2
    : run.status === 'failed' ? XCircle
    : run.status === 'cancelled' ? AlertCircle
    : run.status === 'queued' ? Clock
    : Loader2;

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  };

  const openFile = async () => {
    if (!artifactPath) return;
    const err = await api.app.openPath(artifactPath);
    if (err) window.alert(`Não foi possível abrir o arquivo: ${err}`);
  };

  const openFolder = async () => {
    if (!artifactPath) return;
    const ok = await api.app.showItemInFolder(artifactPath);
    if (!ok) window.alert('Não foi possível abrir a pasta do arquivo.');
  };

  return (
    <li className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 shadow-card hover:shadow-cardHover transition-shadow">
      {/* Avatar */}
      <BotAvatar
        seed={agent?.icon || agent?.slug || `agent-${run.agent_id}`}
        size={40}
        grayscale={run.status === 'cancelled' || run.status === 'failed'}
      />

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-semibold text-primary truncate">
            {agent?.name ?? `Agente #${run.agent_id}`}
          </span>
          <span className="text-[11px] text-muted">run #{run.id}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium',
              style.bg,
              style.text,
            )}
          >
            <StatusIcon size={11} className={isRunning ? 'animate-spin' : ''} />
            {style.label}
          </span>
        </div>
        <div className="text-[12.5px] text-secondary truncate">
          {run.error
            ? <span className="text-[#b91c1c]">{run.error.slice(0, 200)}</span>
            : run.current_step || '—'}
        </div>
        {isRunning && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[#f1f1f4] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue transition-all"
                style={{ width: `${Math.min(100, Math.max(0, run.progress ?? 0))}%` }}
              />
            </div>
            <span className="text-[11px] text-muted tabular-nums w-9 text-right">{run.progress ?? 0}%</span>
          </div>
        )}
        {artifactPath && (
          <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
            <FileText size={11} className="shrink-0" />
            <code className="font-mono truncate flex-1" title={artifactPath}>{artifactPath}</code>
            <button
              type="button"
              onClick={openFile}
              title="Abrir arquivo"
              className="h-6 px-2 rounded-md text-[11px] font-medium text-purple border border-purple-ring bg-white hover:bg-purple-softer transition flex items-center gap-1 shrink-0"
            >
              <ExternalLink size={11} /> Abrir
            </button>
            <button
              type="button"
              onClick={openFolder}
              title="Abrir pasta no Explorador"
              className="h-6 px-2 rounded-md text-[11px] font-medium text-primary border border-border bg-white hover:bg-[#f7f7fb] transition flex items-center gap-1 shrink-0"
            >
              <FolderOpen size={11} /> Pasta
            </button>
          </div>
        )}
      </div>

      {/* Timestamps + ação */}
      <div className="shrink-0 flex flex-col items-end gap-1 text-right">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted leading-none">Início</div>
          <div
            className="text-[12.5px] font-medium text-primary tabular-nums mt-0.5"
            title={`Iniciado ${relativeTime(run.started_at as Date | string | number | null)}`}
          >
            {formatDateTime(run.started_at as Date | string | number | null)}
          </div>
        </div>
        {isTerminal && run.completed_at && (
          <div className="mt-1">
            <div className="text-[11px] uppercase tracking-wider text-muted leading-none">Fim</div>
            <div
              className="text-[12.5px] text-secondary tabular-nums mt-0.5"
              title={`Encerrado ${relativeTime(run.completed_at as Date | string | number | null)}`}
            >
              {formatDateTime(run.completed_at as Date | string | number | null)}
            </div>
          </div>
        )}
        {isRunning && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            title="Cancelar execução"
            className="mt-2 h-7 px-2 rounded-lg text-[11.5px] font-medium text-[#b91c1c] border border-[#f3c2c2] bg-white hover:bg-[#fdf2f2] flex items-center gap-1 disabled:opacity-60 disabled:cursor-wait"
          >
            <X size={12} /> {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
    </li>
  );
}

function KanbanCard({
  run,
  agent,
  artifactPath,
  onCancel,
}: {
  run: AgentRun;
  agent: Agent | undefined;
  artifactPath: string | undefined;
  onCancel: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const isRunning = run.status === 'running' || run.status === 'queued';

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  };

  const openFile = async () => {
    if (!artifactPath) return;
    const err = await api.app.openPath(artifactPath);
    if (err) window.alert(`Não foi possível abrir o arquivo: ${err}`);
  };

  const openFolder = async () => {
    if (!artifactPath) return;
    const ok = await api.app.showItemInFolder(artifactPath);
    if (!ok) window.alert('Não foi possível abrir a pasta do arquivo.');
  };

  return (
    <div className="bg-card rounded-xl border border-border p-2.5 shadow-card hover:shadow-cardHover transition-shadow">
      {/* Cabeçalho compacto: avatar + nome */}
      <div className="flex items-center gap-2 mb-1.5">
        <BotAvatar
          seed={agent?.icon || agent?.slug || `agent-${run.agent_id}`}
          size={28}
          grayscale={run.status === 'cancelled' || run.status === 'failed'}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-primary truncate">
            {agent?.name ?? `Agente #${run.agent_id}`}
          </div>
          <div className="text-[10.5px] text-muted">run #{run.id}</div>
        </div>
      </div>

      {/* Etapa atual / erro */}
      <div className="text-[11.5px] text-secondary leading-snug line-clamp-2">
        {run.error ? (
          <span className="text-[#b91c1c]">{run.error.slice(0, 140)}</span>
        ) : (
          run.current_step || '—'
        )}
      </div>

      {/* Progress bar pra running */}
      {run.status === 'running' && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-[#f1f1f4] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue transition-all"
              style={{ width: `${Math.min(100, Math.max(0, run.progress ?? 0))}%` }}
            />
          </div>
          <span className="text-[10px] text-muted tabular-nums">{run.progress ?? 0}%</span>
        </div>
      )}

      {/* Timestamp + ações compactas */}
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted">
        <span className="tabular-nums" title={formatDateTime(run.started_at as Date | string | number | null)}>
          {relativeTime(run.started_at as Date | string | number | null)}
        </span>
        <div className="flex items-center gap-1">
          {artifactPath && (
            <>
              <button
                type="button"
                onClick={openFile}
                title={`Abrir ${artifactPath}`}
                className="w-6 h-6 rounded-md text-purple hover:bg-purple-softer transition grid place-items-center"
              >
                <ExternalLink size={11} />
              </button>
              <button
                type="button"
                onClick={openFolder}
                title="Abrir pasta no Explorador"
                className="w-6 h-6 rounded-md text-primary hover:bg-[#f7f7fb] transition grid place-items-center"
              >
                <FolderOpen size={11} />
              </button>
            </>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              title="Cancelar execução"
              className="w-6 h-6 rounded-md text-[#b91c1c] hover:bg-[#fdf2f2] transition grid place-items-center disabled:opacity-50 disabled:cursor-wait"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
