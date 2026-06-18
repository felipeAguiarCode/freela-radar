import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Braces,
  Cpu,
  Download,
  FileOutput,
  GripVertical,
  Play,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../ipc/api';
import { cn, safeParseJson } from '../lib/utils';
import type { Agent, AgentTool } from '../types';
import { BotAvatar } from '../components/BotAvatar';
import { ImportAgentsModal, type ImportCandidate } from '../components/ImportAgentsModal';

const TOOLS = ['filesystem', 'terminal', 'browser', 'playwright', 'markdown_export', 'database', 'internet'];

const EFFORT_LEVELS = ['low', 'medium', 'high', 'maximum'];
const AUTONOMY_LEVELS = ['manual', 'semi', 'autonomous', 'full'];
const OUTPUT_FORMATS = ['markdown', 'structured_markdown', 'json', 'checklist', 'report', 'rich_text'];
const MODELS = ['sonnet', 'opus', 'haiku'];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `agente-${Date.now()}`;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

interface AgentsPageProps {
  initialAgentId?: number | null;
}

export function AgentsPage({ initialAgentId }: AgentsPageProps = {}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialAgentId ?? null);
  const [creating, setCreating] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  // Import/export do time de agentes
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[] | null>(null);
  const [importing, setImporting] = useState(false);

  // Quando o RadarPage navega pra cá com um agente específico em mãos,
  // força a seleção mesmo se a página já estava montada (ex: usuário volta
  // ao dashboard e clica em outro agente, sem o componente desmontar entre).
  useEffect(() => {
    if (initialAgentId != null) {
      setSelectedId(initialAgentId);
    }
  }, [initialAgentId]);

  useEffect(() => {
    api.agents.list().then((list) => {
      setAgents(list);
      if (list.length && selectedId == null) setSelectedId(list[0].id);
    });
  }, []);

  const selected = agents.find((a) => a.id === selectedId);

  const createAgent = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const existingSlugs = new Set(agents.map((a) => a.slug));
      const baseName = 'Novo agente';
      let name = baseName;
      let i = 2;
      while (existingSlugs.has(slugify(name))) {
        name = `${baseName} ${i++}`;
      }
      const created = await api.agents.create({
        name,
        slug: slugify(name),
        description: 'Descreva o propósito deste agente.',
        icon: randomSeed(),
      });
      setAgents((prev) => [...prev, created]);
      setSelectedId(created.id);
    } finally {
      setCreating(false);
    }
  };

  // Exporta o time inteiro como JSON serializado (download), com TODAS as
  // configs de cada agente — incluindo as ferramentas (tools) habilitadas.
  // Remove campos de instância (id, ordem, timestamps) pra ficar portável.
  const exportTeam = async () => {
    if (agents.length === 0) return;
    const stripped = await Promise.all(
      agents.map(async (a) => {
        const copy = { ...a } as Record<string, unknown>;
        delete copy.id;
        delete copy.sort_order;
        delete copy.created_at;
        delete copy.updated_at;
        try {
          const tools = await api.agents.listTools(a.id);
          copy.tools = tools.map((t) => ({ tool_name: t.tool_name, enabled: !!t.enabled }));
        } catch {
          copy.tools = [];
        }
        return copy;
      }),
    );
    const payload = {
      type: 'freela-radar-agent-team',
      version: 1,
      count: stripped.length,
      agents: stripped,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'freela-radar-time-de-agentes.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const pickImportFile = () => fileInputRef.current?.click();

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo depois
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const arr: unknown = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.agents)
            ? parsed.agents
            : null;
        if (!Array.isArray(arr) || arr.length === 0) {
          window.alert('JSON inválido: esperado um array de agentes ou um objeto { agents: [...] }.');
          return;
        }
        setImportCandidates(arr as ImportCandidate[]);
      } catch (err) {
        window.alert(`Não foi possível ler o JSON: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async (selected: ImportCandidate[]) => {
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const res = await api.agents.importTeam(selected as Array<Record<string, unknown>>);
      if (res?.created?.length) {
        setAgents((prev) => [...prev, ...res.created]);
        setSelectedId(res.created[0].id);
      }
      setImportCandidates(null);
    } catch (e) {
      window.alert(`Falha ao importar: ${String((e as Error).message ?? e)}`);
    } finally {
      setImporting(false);
    }
  };

  const requestDelete = (id: number) => {
    const target = agents.find((a) => a.id === id);
    if (!target) return;
    setAgentToDelete(target);
  };

  const confirmDelete = async () => {
    if (!agentToDelete) return;
    await api.agents.delete(agentToDelete.id);
    setAgents((prev) => {
      const next = prev.filter((a) => a.id !== agentToDelete.id);
      if (selectedId === agentToDelete.id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setAgentToDelete(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = agents.findIndex((a) => a.id === active.id);
    const newIndex = agents.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(agents, oldIndex, newIndex);
    setAgents(reordered);
    try {
      await api.agents.reorder(reordered.map((a) => a.id));
    } catch (e) {
      console.error('Falha ao salvar nova ordem', e);
      window.alert(`Não foi possível salvar a nova ordem: ${String((e as Error).message ?? e)}`);
      const fresh = await api.agents.list();
      setAgents(fresh);
    }
  };

  return (
    <div className="grid grid-cols-[320px_1fr] h-full overflow-hidden">
      {/* Agent list */}
      <aside className="border-r border-border bg-white overflow-y-auto flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[18px] font-bold text-primary">Estúdio de agentes</h1>
              <p className="text-[13px] text-secondary mt-1">
                Construa, modifique e gerencie sua fila de execução de agentes.
              </p>
            </div>
            <button
              onClick={createAgent}
              disabled={creating}
              title="Novo agente"
              className="h-9 px-3 rounded-xl bg-purple text-white text-[12.5px] font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60 shrink-0"
            >
              <Plus size={14} />
              Novo
            </button>
          </div>
          {/* Importar / Exportar time de agentes */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={pickImportFile}
              title="Importar agentes de um arquivo JSON"
              className="flex-1 h-9 rounded-xl border border-border bg-white text-[12.5px] font-medium text-primary flex items-center justify-center gap-1.5 hover:bg-[#f8f8fb] transition"
            >
              <Upload size={14} /> Importar time
            </button>
            <button
              onClick={exportTeam}
              disabled={agents.length === 0}
              title="Exportar todos os agentes como JSON"
              className="flex-1 h-9 rounded-xl border border-border bg-white text-[12.5px] font-medium text-primary flex items-center justify-center gap-1.5 hover:bg-[#f8f8fb] disabled:opacity-50 transition"
            >
              <Download size={14} /> Exportar time
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onImportFile}
            className="hidden"
          />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={agents.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="p-3 space-y-1">
              {agents.map((a) => (
                <SortableAgentRow
                  key={a.id}
                  agent={a}
                  active={a.id === selectedId}
                  onSelect={() => setSelectedId(a.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </aside>

      {/* Editor */}
      <section className="overflow-y-auto">
        {selected ? (
          <AgentEditor
            key={selected.id}
            agent={selected}
            onSaved={(saved) => {
              setAgents((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
            }}
            onDelete={() => requestDelete(selected.id)}
          />
        ) : (
          <div className="h-full grid place-items-center text-secondary">
            {agents.length === 0 ? 'Crie seu primeiro agente em “Novo”.' : 'Selecione um agente'}
          </div>
        )}
      </section>

      {agentToDelete && (
        <DeleteAgentModal
          agent={agentToDelete}
          onCancel={() => setAgentToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {importCandidates && (
        <ImportAgentsModal
          candidates={importCandidates}
          importing={importing}
          onCancel={() => setImportCandidates(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

function SortableAgentRow({
  agent,
  active,
  onSelect,
}: {
  agent: Agent;
  active: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
  });
  const disabled = agent.enabled === false;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl transition',
        isDragging && 'shadow-cardHover ring-2 ring-purple-ring bg-white opacity-95',
      )}
    >
      <div
        className={cn(
          'group w-full flex items-center gap-2 px-2 py-2.5 rounded-xl transition',
          active ? 'bg-purple-soft' : 'hover:bg-[#f7f7fb]',
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reordenar agente"
          className="shrink-0 w-6 h-9 grid place-items-center text-muted cursor-grab active:cursor-grabbing hover:text-primary touch-none"
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
          title={disabled ? `${agent.name} — desativado` : agent.name}
        >
          <BotAvatar
            seed={agent.icon || agent.slug}
            size={36}
            grayscale={disabled}
          />
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                'text-[14px] font-semibold truncate',
                disabled ? 'text-muted' : 'text-primary',
              )}
            >
              {agent.name}
            </div>
            <div
              className={cn(
                'text-[12px] truncate',
                disabled ? 'text-muted/80' : 'text-secondary',
              )}
            >
              {disabled ? 'Desativado' : agent.description}
            </div>
          </div>
        </button>
      </div>
    </li>
  );
}

interface EditorProps {
  agent: Agent;
  onSaved: (a: Agent) => void;
  onDelete: () => void;
}

function AgentEditor({ agent, onSaved, onDelete }: EditorProps) {
  // O parent usa key={selected.id} → ao trocar de agente o componente
  // remonta e useState(agent) reinicializa o draft. Não precisamos de
  // setDraft(agent) em useEffect, e qualquer chamada extra desse setDraft
  // sobrescreveria o que o usuário acabou de digitar.
  const [draft, setDraft] = useState<Agent>(agent);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.agents.listTools(agent.id).then(setTools);
  }, [agent.id]);

  function set<K extends keyof Agent>(key: K, value: Agent[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const toolEnabled = (name: string) => tools.find((t) => t.tool_name === name)?.enabled ?? false;
  const toggleTool = async (name: string) => {
    const next = !toolEnabled(name);
    await api.agents.setTool(agent.id, name, next);
    const list = await api.agents.listTools(agent.id);
    setTools(list);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.agents.update(agent.id, {
        name: draft.name,
        slug: slugify(draft.name),
        description: draft.description,
        soul_prompt: draft.soul_prompt,
        system_prompt: draft.system_prompt,
        operational_prompt: draft.operational_prompt,
        output_format: draft.output_format,
        effort_level: draft.effort_level,
        autonomy_level: draft.autonomy_level,
        model: draft.model,
        temperature: draft.temperature,
        max_tokens: draft.max_tokens,
        timeout_seconds: draft.timeout_seconds,
        retries: draft.retries,
        icon: draft.icon,
        enabled: draft.enabled,
      });
      onSaved(updated);
      setToast('Agente salvo');
      setTimeout(() => setToast(null), 2400);
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S salva o agente (mesmo comportamento do botão disquete).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Switch ativo/inativo persiste na hora, sem precisar do botão Salvar.
  const toggleEnabled = async () => {
    const next = !draft.enabled;
    set('enabled', next);
    try {
      const updated = await api.agents.update(agent.id, { enabled: next });
      onSaved(updated);
      setToast(next ? 'Agente ativado' : 'Agente desativado');
      setTimeout(() => setToast(null), 1800);
    } catch (e) {
      set('enabled', !next); // rollback
      setToast(`Erro: ${String((e as Error).message ?? e)}`);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const runOnce = async () => {
    setRunning(true);
    try {
      // Execução manual standalone — sem oportunidade associada.
      const runId = await api.agents.run(agent.id, null);
      setToast(runId ? `Execução iniciada (run #${runId})` : 'Execução enfileirada');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast(`Erro: ${String((e as Error).message ?? e)}`);
      setTimeout(() => setToast(null), 4000);
      setRunning(false);
    }
  };

  // Escuta eventos da run em andamento pra mostrar o caminho do arquivo
  // gerado quando o agente terminar.
  useEffect(() => {
    const off = api.agents.onRunEvent((evt) => {
      if (evt.agentId !== agent.id) return;
      if (evt.status === 'completed') {
        setRunning(false);
        setToast(
          evt.outputFilePath
            ? `Concluído — salvo em ${evt.outputFilePath}`
            : 'Concluído',
        );
        setTimeout(() => setToast(null), 6000);
      } else if (evt.status === 'failed' || evt.status === 'cancelled') {
        setRunning(false);
        setToast(`Falhou: ${evt.error ?? 'erro desconhecido'}`);
        setTimeout(() => setToast(null), 5000);
      }
    });
    return off;
  }, [agent.id]);

  const runtimeConfig = safeParseJson<Record<string, unknown>>(draft.runtime_config_json, {});

  return (
    <div className="max-w-3xl mx-auto px-8 py-7 space-y-7">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-bold text-primary">{draft.name}</h2>
          <p className="text-[13px] text-secondary mt-1">slug: <code className="text-primary">{draft.slug}</code></p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={draft.enabled !== false}
            onChange={toggleEnabled}
          />
          <button
            onClick={onDelete}
            title="Excluir agente"
            aria-label="Excluir agente"
            className="w-10 h-10 rounded-xl bg-[#dc2626] text-white grid place-items-center hover:bg-[#b91c1c] transition"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={runOnce}
            disabled={running}
            title={running ? 'Disparando…' : 'Executar agora'}
            aria-label="Executar agora"
            className="w-10 h-10 rounded-xl bg-[#16a34a] text-white grid place-items-center hover:bg-[#15803d] transition disabled:opacity-60"
          >
            <Play size={16} fill="currentColor" />
          </button>
          <button
            onClick={save}
            disabled={saving}
            title={saving ? 'Salvando…' : 'Salvar alterações'}
            aria-label="Salvar"
            className="w-10 h-10 rounded-xl bg-purple text-white grid place-items-center hover:opacity-90 transition disabled:opacity-60"
          >
            <Save size={16} />
          </button>
        </div>
      </header>

      {/* Identidade */}
      <Section title="Identidade" icon={User}>
        <Field label="Avatar do agente">
          <IconPicker
            value={draft.icon}
            onChange={(seed) => set('icon', seed)}
          />
        </Field>
        <Field label="Nome">
          <input
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({ ...d, name, slug: slugify(name) }));
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Função">
          <input
            value={draft.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Qual é a função principal deste agente?"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Soul */}
      <Section title="Soul" icon={Sparkles} subtitle="Personalidade, tom, postura, prioridades.">
        <textarea
          value={draft.soul_prompt ?? ''}
          onChange={(e) => set('soul_prompt', e.target.value)}
          rows={6}
          className={textareaCls}
          placeholder="Defina como o agente pensa e se comporta…"
        />
      </Section>

      {/* System Prompt */}
      <Section title="System Prompt" icon={Target} subtitle="Escreva aqui o seu goal — a missão central do agente.">
        <textarea
          value={draft.system_prompt ?? ''}
          onChange={(e) => set('system_prompt', e.target.value)}
          rows={8}
          className={textareaCls}
          placeholder="Escreva aqui o seu goal…"
        />
      </Section>

      {/* Guardrails Prompt */}
      <Section title="Guardrails Prompt" icon={Shield} subtitle="Regras táticas adicionais e limites de atuação.">
        <textarea
          value={draft.operational_prompt ?? ''}
          onChange={(e) => set('operational_prompt', e.target.value)}
          rows={5}
          className={textareaCls}
        />
      </Section>

      {/* Output */}
      <Section title="Output Configuration" icon={FileOutput}>
        <Field label="Formato de saída">
          <select value={draft.output_format} onChange={(e) => set('output_format', e.target.value)} className={inputCls}>
            {OUTPUT_FORMATS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
      </Section>

      {/* Modelo + Esforço + Autonomia */}
      <Section title="Modelo & Execução" icon={Cpu}>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Modelo">
            <select value={draft.model} onChange={(e) => set('model', e.target.value)} className={inputCls}>
              {MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Effort level">
            <select value={draft.effort_level} onChange={(e) => set('effort_level', e.target.value)} className={inputCls}>
              {EFFORT_LEVELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Autonomia">
            <select value={draft.autonomy_level} onChange={(e) => set('autonomy_level', e.target.value)} className={inputCls}>
              {AUTONOMY_LEVELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Temperature">
            <input type="number" step="0.05" min={0} max={1} value={draft.temperature ?? 0.3}
              onChange={(e) => set('temperature', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Max tokens">
            <input type="number" value={draft.max_tokens ?? 12000}
              onChange={(e) => set('max_tokens', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Timeout (s)">
            <input type="number" value={draft.timeout_seconds ?? 300}
              onChange={(e) => set('timeout_seconds', Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Tools */}
      <Section title="Ferramentas" icon={Wrench}>
        <div className="grid grid-cols-3 gap-3">
          {TOOLS.map((t) => {
            const enabled = toolEnabled(t);
            return (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl border text-[13px] font-medium transition text-left',
                  enabled ? 'border-purple-ring bg-purple-softer text-purple' : 'border-border bg-white text-primary hover:bg-[#f8f8fb]',
                )}
              >
                <span>{t}</span>
                <span className={cn('w-2 h-2 rounded-full', enabled ? 'bg-purple' : 'bg-[#dcdce3]')} />
              </button>
            );
          })}
        </div>
      </Section>

      {/* Runtime preview */}
      <Section title="Runtime config (JSON)" icon={Braces}>
        <pre className="bg-[#0f1322] text-[#cdd5f5] text-[12px] leading-relaxed p-4 rounded-xl overflow-x-auto">
{JSON.stringify({
  model: draft.model,
  effort: draft.effort_level,
  autonomy: draft.autonomy_level,
  cloud_p: true,
  skip_permissions: true,
  temperature: draft.temperature,
  max_tokens: draft.max_tokens,
  timeout_seconds: draft.timeout_seconds,
  tools: Object.fromEntries(tools.map((t) => [t.tool_name, t.enabled])),
  ...runtimeConfig,
}, null, 2)}
        </pre>
      </Section>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-primary text-white px-4 py-3 rounded-xl shadow-cardHover flex items-center gap-3 z-50">
          <span className="text-[13.5px]">{toast}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <div className="mb-3 flex items-start gap-2.5">
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-purple-soft text-purple grid place-items-center shrink-0 mt-0.5">
            <Icon size={14} strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
          {subtitle && <p className="text-[12.5px] text-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls = 'w-full h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-purple-ring';
const textareaCls = 'w-full px-3 py-2.5 rounded-xl border border-border bg-white text-[13.5px] outline-none focus:border-purple-ring leading-relaxed font-mono';

function DeleteAgentModal({
  agent,
  onCancel,
  onConfirm,
}: {
  agent: Agent;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const canConfirm = typed === agent.name && !busy;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-[#0f1322]/55 backdrop-blur-sm grid place-items-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-cardHover w-full max-w-[520px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header vermelho — sinaliza ação destrutiva */}
        <header className="flex items-start gap-3 px-6 py-5 border-b-2 border-[#dc2626] bg-[#fdf2f2]">
          <div className="w-10 h-10 rounded-xl bg-[#dc2626] text-white grid place-items-center shrink-0">
            <Trash2 size={18} />
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-[#7f1d1d] leading-tight">Excluir agente</h2>
            <p className="text-[13px] text-[#991b1b] mt-0.5">
              Esta ação é permanente e remove todas as ferramentas, execuções e artefatos associados.
            </p>
          </div>
        </header>

        <div className="px-6 py-5 space-y-4">
          <div className="text-[13.5px] text-primary leading-relaxed">
            Para confirmar, digite{' '}
            <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[13px] font-mono text-[#dc2626] font-semibold">
              {agent.name}
            </code>{' '}
            abaixo:
          </div>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm) {
                e.preventDefault();
                handleConfirm();
              }
              if (e.key === 'Escape') onCancel();
            }}
            placeholder={agent.name}
            className="w-full h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-[#dc2626] font-mono"
          />
        </div>

        <footer className="px-6 py-4 bg-[#fafafb] border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-[40px] px-4 rounded-xl border border-border bg-white text-[13.5px] font-medium text-primary hover:bg-[#f8f8fb]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              'h-[40px] px-4 rounded-xl text-[13.5px] font-semibold flex items-center gap-2 transition',
              canConfirm
                ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]'
                : 'bg-[#fca5a5] text-white cursor-not-allowed',
            )}
          >
            <Trash2 size={14} />
            {busy ? 'Excluindo…' : 'Excluir este agente'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  const label = checked ? 'Ativo' : 'Inativo';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={cn(
        'inline-flex items-center w-11 h-6 p-0.5 rounded-full transition-colors shrink-0 mr-1',
        checked ? 'bg-purple' : 'bg-[#cdcdd6]',
      )}
    >
      <span
        className={cn(
          'block w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

const BOT_PHRASES = [
  // Nerds / games
  'Estou ansioso pelas coisas que vamos criar juntos!',
  'Uau, o nível de possibilidades é maior que 8.000!',
  'Sim, mestre? Pronto para o trabalho!',
  'Trabalho quase feito, chefe!',
  'Pronto pra trabalhar mais que um anão de Khazad-dûm.',
  'Compilando neurônios artificiais… beep boop.',
  'Todos os seus bugs pertencem a nós.',
  'Cogito, ergo execute().',
  'É perigoso ir sozinho — leve este agente!',
  'Que a Força esteja com nossos prompts.',
  'Conquista desbloqueada: avatar escolhido!',
  'Eu sou Groot. (Tradução: posso ajudar?)',
  'Olá, caro humano! Beep. Boop.',
  'Ctrl+Z não funciona na vida real. Escolha com sabedoria.',
  'Por Crom! Estou pronto pra batalha.',
  'Wololo! Wololo!',
  'Hodor. Hodor. (= "estou aqui pra ajudar")',
  'Que os loops estejam sempre a seu favor.',
  'Ahh, carne fresca! Quer dizer, tarefa fresca.',
  '42. A resposta sempre foi 42.',
  // Filmes e séries
  'Acorde, Neo. A Matrix tem tarefas pra você.',
  'Você não vai passar! …ah, foi mal, pode passar.',
  'Vou fazer uma oferta que você não poderá recusar.',
  'Voltarei. Mas antes, termino essa tarefa.',
  'Houston, temos uma execução.',
  'Ao infinito… e além!',
  'Você é um agente, Harry!',
  'Venha comigo se quiser sobreviver ao prazo.',
  'Vida longa e próspera aos nossos prompts.',
  'Hakuna Matata. Erros? Não conheço.',
  'Eu sou aquele que bate na porta. (Modo dev)',
  'O inverno está chegando, melhor terminar logo.',
  'Este é o caminho.',
  'Todo mundo mente. Menos código — código não mente.',
  'Olá, amigo. Pronto pra hackear a mediocridade?',
  'Allons-y, parceiro!',
  'O jogo está acontecendo, Watson.',
  'Bella ciao, bella ciao, bella ciao ciao ciao!',
  'Eleven, abre o portal pro próximo prompt.',
  'Faça ou não faça. Tentativa, não há.',
  // Batman
  'Eu sou a noite. Eu sou o agente.',
  'Por que caímos? Para aprender a debugar.',
  'Não sou o herói que você merece, mas o que você precisa agora.',
  'Sou a vingança contra os bugs.',
];

function pickPhrase(prev?: string): string {
  // Evita repetir a mesma frase consecutiva.
  if (BOT_PHRASES.length <= 1) return BOT_PHRASES[0];
  let next = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
  while (next === prev) next = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
  return next;
}

function useTypewriter(text: string, speedMs = 28): { displayed: string; typing: boolean } {
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    setDisplayed('');
    setTyping(true);
    if (!text) {
      setTyping(false);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setTyping(false);
      }
    }, speedMs);
    return () => clearInterval(id);
  }, [text, speedMs]);
  return { displayed, typing };
}

function IconPicker({ value, onChange }: { value: string; onChange: (seed: string) => void }) {
  const [shuffleKey, setShuffleKey] = useState(0);
  const [phrase, setPhrase] = useState(() => pickPhrase());
  const { displayed, typing } = useTypewriter(phrase);

  // Sempre que `value` muda (= usuário escolheu novo avatar), sorteia nova frase.
  useEffect(() => {
    setPhrase((prev) => pickPhrase(prev));
  }, [value]);

  const suggestions = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 11; i++) list.push(randomSeed());
    list.unshift(value || 'default');
    return list;
    // shuffleKey força regenerar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleKey]);

  return (
    <div className="space-y-3">
      {/* Preview grande + balão de fala */}
      <div className="flex items-start gap-4">
        <BotAvatar seed={value || 'default'} size={88} />
        <div className="flex-1 min-w-0 relative pt-4">
          {/* Tail do balão apontando pro avatar */}
          <div className="absolute -left-1.5 top-7 w-3 h-3 bg-white border-l border-b border-border rotate-45" />
          <div className="bg-white border border-border rounded-2xl px-4 py-3 shadow-sm min-h-[64px] flex items-center">
            <p className="text-[13.5px] text-primary italic leading-relaxed">
              {displayed}
              <span
                className={cn(
                  'inline-block w-[2px] h-[14px] align-middle ml-0.5 bg-purple',
                  typing ? 'animate-pulse' : 'opacity-0',
                )}
              />
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShuffleKey((k) => k + 1)}
          title="Gerar novas sugestões"
          className="h-10 px-3 rounded-xl border border-border bg-white text-[13px] font-medium text-primary flex items-center gap-2 hover:bg-[#f8f8fb] mt-4"
        >
          <RefreshCw size={14} />
          Sortear
        </button>
      </div>

      {/* Grid de sugestões */}
      <div className="grid grid-cols-6 gap-2">
        {suggestions.map((seed, idx) => {
          const active = seed === value;
          return (
            <button
              key={`${seed}-${idx}`}
              type="button"
              onClick={() => onChange(seed)}
              title={seed}
              className={cn(
                'aspect-square rounded-xl border grid place-items-center overflow-hidden',
                active
                  ? 'border-purple-ring bg-purple-softer ring-2 ring-purple/30 animate-bomberman-select'
                  : 'border-border bg-white hover:bg-[#f8f8fb] transition',
              )}
            >
              <BotAvatar seed={seed} size={48} />
            </button>
          );
        })}
      </div>

    </div>
  );
}

