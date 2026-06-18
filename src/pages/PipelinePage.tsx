import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { motion, AnimatePresence, type TargetAndTransition } from 'framer-motion';
import { Workflow, Plus, ArrowRight, Coffee, Sprout } from 'lucide-react';
import { api } from '../ipc/api';
import { cn } from '../lib/utils';
import { BotAvatar } from '../components/BotAvatar';
import type { Agent } from '../types';
import tablePcUrl from '../assets/table-pc.png';
import bgOfficeUrl from '../assets/bg_office.png';

type AnimationVariant = 'dance' | 'bounce' | 'zoom';
const ANIMATION_VARIANTS: AnimationVariant[] = ['dance', 'bounce', 'zoom'];

function randomAnimation(): AnimationVariant {
  return ANIMATION_VARIANTS[Math.floor(Math.random() * ANIMATION_VARIANTS.length)];
}

// Balões de expressão estilo RPG Maker — cada um é mostrado por ~2.4s.
const BALLOON_EMOJIS = [
  '☕', '😡', '😄', '❤️', '😭', '💡', '✅',
  '😎', '🦾', '🕵️‍♂️', '📊', '📝', '📈',
] as const;
type BalloonEmoji = (typeof BALLOON_EMOJIS)[number];
interface Balloon {
  emoji: BalloonEmoji;
  key: number; // pra invalidar timeout antigo quando uma nova chega
}
const BALLOON_DURATION_MS = 2400;
const BALLOON_TICK_MIN_MS = 2500;
const BALLOON_TICK_MAX_MS = 5500;

function randomBalloon(): BalloonEmoji {
  return BALLOON_EMOJIS[Math.floor(Math.random() * BALLOON_EMOJIS.length)];
}

function getAnimationProps(variant: AnimationVariant): {
  animate: TargetAndTransition;
  transition: { duration: number; repeat: number; ease: 'easeInOut' | 'easeOut'; repeatDelay?: number };
} {
  switch (variant) {
    case 'dance':
      // distorce a imagem de um lado pro outro
      return {
        animate: { skewX: [-6, 6, -6], rotate: [-2, 2, -2] },
        transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
      };
    case 'bounce':
      // pulinho estilo emoji do Super Bomberman SNES
      return {
        animate: { y: [0, -7, 0, -3, 0] },
        transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 },
      };
    case 'zoom':
      // zoom in/out estilo sprite mode 7 SNES
      return {
        animate: { scale: [0.92, 1.08, 0.92] },
        transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
      };
  }
}

const DRAGGABLE_PREFIX = 'agent-';
const DESK_PREFIX = 'desk-';
const WAITING_ROOM_ID = 'waiting-room';

type Location = 'desk' | 'waiting';

export function PipelinePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeDragAgent, setActiveDragAgent] = useState<Agent | null>(null);
  const [balloons, setBalloons] = useState<Record<number, Balloon>>({});

  useEffect(() => {
    api.agents.list().then(setAgents);
  }, []);

  const activeAgents = useMemo(
    () =>
      [...agents]
        .filter((a) => a.enabled !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [agents],
  );

  const waitingAgents = useMemo(
    () => [...agents].filter((a) => a.enabled === false).sort((a, b) => a.id - b.id),
    [agents],
  );

  // Ticker de balões: a cada 2.5–5.5s sorteia um agente ativo + um emoji
  // e mostra o balão por ~2.4s. Cleanup ao desmontar pra não vazar timer.
  useEffect(() => {
    if (activeAgents.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;
    const cleanups: ReturnType<typeof setTimeout>[] = [];

    const schedule = () => {
      const delay =
        BALLOON_TICK_MIN_MS + Math.random() * (BALLOON_TICK_MAX_MS - BALLOON_TICK_MIN_MS);
      timer = setTimeout(() => {
        if (!mounted) return;
        const agent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        const emoji = randomBalloon();
        const key = Date.now() + Math.random();
        setBalloons((prev) => ({ ...prev, [agent.id]: { emoji, key } }));
        // Remove o balão após a duração — só se ainda for esse mesmo balão.
        const clear = setTimeout(() => {
          setBalloons((prev) => {
            if (prev[agent.id]?.key !== key) return prev;
            const next = { ...prev };
            delete next[agent.id];
            return next;
          });
        }, BALLOON_DURATION_MS);
        cleanups.push(clear);
        schedule(); // próxima rodada
      }, delay);
    };

    schedule();
    return () => {
      mounted = false;
      clearTimeout(timer);
      cleanups.forEach(clearTimeout);
    };
  }, [activeAgents]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const refresh = async () => {
    const fresh = await api.agents.list();
    setAgents(fresh);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const idStr = String(event.active.id);
    if (!idStr.startsWith(DRAGGABLE_PREFIX)) return;
    const id = Number(idStr.slice(DRAGGABLE_PREFIX.length));
    setActiveDragAgent(agents.find((a) => a.id === id) ?? null);
  };

  const handleDragCancel = () => {
    setActiveDragAgent(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragAgent(null);
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (!activeIdStr.startsWith(DRAGGABLE_PREFIX)) return;
    const agentId = Number(activeIdStr.slice(DRAGGABLE_PREFIX.length));
    const movedAgent = agents.find((a) => a.id === agentId);
    if (!movedAgent) return;

    setBusy(true);
    try {
      // Caso 1: drop em sala de espera → desativa o agente
      if (overIdStr === WAITING_ROOM_ID) {
        if (movedAgent.enabled === false) return; // já tava lá
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, enabled: false } : a)),
        );
        await api.agents.update(agentId, { enabled: false });
        return;
      }

      // Caso 2: drop numa mesa
      if (overIdStr.startsWith(DESK_PREFIX)) {
        const targetIndex = Number(overIdStr.slice(DESK_PREFIX.length));
        const isFromWaiting = movedAgent.enabled === false;

        if (isFromWaiting) {
          // waiting → desk: ativa e insere na posição
          const newActive = [...activeAgents];
          const clamped = Math.max(0, Math.min(targetIndex, newActive.length));
          newActive.splice(clamped, 0, { ...movedAgent, enabled: true });
          const reorderedIds = newActive.map((a) => a.id);
          // Atualiza enabled + sort_order localmente pra UI refletir imediatamente
          setAgents((prev) => {
            const positionById = new Map<number, number>();
            reorderedIds.forEach((id, idx) => positionById.set(id, idx + 1));
            return prev.map((a) => {
              const newPos = positionById.get(a.id);
              if (a.id === agentId) {
                return { ...a, enabled: true, sort_order: newPos ?? a.sort_order };
              }
              return newPos !== undefined ? { ...a, sort_order: newPos } : a;
            });
          });
          await api.agents.update(agentId, { enabled: true });
          await api.agents.reorder(reorderedIds);
          return;
        }

        // desk → desk
        const fromIndex = activeAgents.findIndex((a) => a.id === agentId);
        if (fromIndex < 0) return;
        const isEmptySlot = targetIndex >= activeAgents.length;
        const clamped = isEmptySlot ? activeAgents.length - 1 : targetIndex;
        if (fromIndex === clamped) return;

        const reordered = [...activeAgents];
        if (isEmptySlot) {
          // Slot vazio "+" — move pra última posição (não há ninguém pra trocar)
          const [moved] = reordered.splice(fromIndex, 1);
          reordered.push(moved);
        } else {
          // Mesa ocupada — TROCA direta de posições entre os dois agentes
          [reordered[fromIndex], reordered[clamped]] = [reordered[clamped], reordered[fromIndex]];
        }
        const reorderedIds = reordered.map((a) => a.id);
        // Atualiza sort_order localmente também — o useMemo derivado reordena
        // por sort_order, então se só trocássemos o array sem mudar os valores,
        // a UI voltaria pra ordem antiga no próximo render.
        setAgents((prev) => {
          const positionById = new Map<number, number>();
          reorderedIds.forEach((id, idx) => positionById.set(id, idx + 1));
          const next = prev.map((a) => {
            const newPos = positionById.get(a.id);
            return newPos !== undefined ? { ...a, sort_order: newPos } : a;
          });
          // Preserva contrato anterior: ativos primeiro, inativos depois
          const byId = new Map(next.map((a) => [a.id, a]));
          return [
            ...reorderedIds.map((id) => byId.get(id)!).filter(Boolean),
            ...next.filter((a) => a.enabled === false),
          ];
          return next;
        });
        await api.agents.reorder(reorderedIds);
      }
    } catch (e) {
      console.error('[PipelinePage] handleDragEnd falhou', e);
      window.alert(`Falha ao reorganizar: ${String((e as Error).message ?? e)}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-7">
        <header className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-soft text-purple grid place-items-center shrink-0">
            <Workflow size={18} strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-primary leading-tight">Pipeline</h1>
            <p className="text-[13px] text-secondary mt-0.5">
              Organize visualmente o time. A ordem das mesas é a ordem de execução.
            </p>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <OpenSpace agents={activeAgents} busy={busy} balloons={balloons} />
          <WaitingRoom agents={waitingAgents} busy={busy} />
          <DragOverlay dropAnimation={null}>
            {activeDragAgent && (
              <div className="cursor-grabbing">
                <BotAvatar
                  seed={activeDragAgent.icon || activeDragAgent.slug}
                  size={52}
                  className="drop-shadow-lg"
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

const STATIONS_PER_ROW = 4;

function OpenSpace({
  agents,
  busy,
  balloons,
}: {
  agents: Agent[];
  busy: boolean;
  balloons: Record<number, Balloon>;
}) {
  // Total = agentes + uma "vaga de admissão" no fim pra inserir o próximo.
  const totalStations = agents.length + 1;

  // Quebra em linhas de 4 estações. A última linha pode ter < 4 slots.
  const rows: { agent: Agent | undefined; index: number }[][] = [];
  for (let i = 0; i < totalStations; i += STATIONS_PER_ROW) {
    const row: { agent: Agent | undefined; index: number }[] = [];
    for (let j = 0; j < STATIONS_PER_ROW && i + j < totalStations; j++) {
      row.push({ agent: agents[i + j], index: i + j });
    }
    rows.push(row);
  }

  return (
    <section className="bg-card rounded-2xl border border-border p-5 mb-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-secondary uppercase tracking-wider">
            Office space
          </span>
          <ArrowRight size={14} className="text-muted" />
          <span className="text-[12px] text-muted">execução em ordem</span>
        </div>
        <span className="text-[12px] text-muted tabular-nums">{agents.length} agente(s)</span>
      </div>

      {/* Piso do escritório — imagem `bg_office.png` cobre todo o card */}
      <div
        className="relative rounded-xl p-10 min-h-[320px] overflow-hidden"
        style={{
          backgroundImage: `url(${bgOfficeUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Overlay preto translúcido pra deixar o fundo menos chamativo
            e reforçar contraste com mesas, bots e labels */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          aria-hidden="true"
        />
        {/* Decorações nos cantos pra dar "vida" */}
        <Sprout size={22} className="absolute top-4 left-4 text-[#16a34a] opacity-70" aria-hidden="true" />
        <Sprout size={22} className="absolute top-4 right-4 text-[#16a34a] opacity-70" aria-hidden="true" />
        <Coffee size={22} className="absolute bottom-4 right-4 text-secondary opacity-60" aria-hidden="true" />

        {/* Filas de baias — gap-y grande simula corredor entre fileiras */}
        <div className="relative z-10 flex flex-col gap-14 items-center">
          {rows.map((row, rowIdx) => (
            <DeskRow key={rowIdx} stations={row} disabled={busy} balloons={balloons} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DeskRow({
  stations,
  disabled,
  balloons,
}: {
  stations: { agent: Agent | undefined; index: number }[];
  disabled: boolean;
  balloons: Record<number, Balloon>;
}) {
  return (
    <div className="flex items-end gap-10">
      {stations.map(({ agent, index }) => (
        <DeskStation
          key={index}
          index={index}
          agent={agent}
          disabled={disabled}
          balloon={agent ? balloons[agent.id] : undefined}
        />
      ))}
    </div>
  );
}

function DeskStation({
  index,
  agent,
  disabled,
  balloon,
}: {
  index: number;
  agent: Agent | undefined;
  disabled: boolean;
  balloon?: Balloon;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DESK_PREFIX}${index}`, disabled });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex flex-col items-center w-[150px] p-2 rounded-xl transition',
        isOver && 'bg-purple-softer/60 ring-2 ring-purple',
      )}
    >
      {/* Container da bancada — imagem da mesa/PC + avatar do agente em overlay */}
      <div className="relative w-[140px] h-[140px]">
        {/* Fallback CSS de mesa caso a imagem falhe — fica atrás (z-0) */}
        <div className="absolute inset-x-2 bottom-4 h-12 rounded-md bg-[#c8956d] border border-[#8b6342] z-0" aria-hidden="true" />
        {/* PNG da workstation (mesa + computador + cadeira) */}
        <img
          src={tablePcUrl}
          alt="workstation"
          className={cn(
            'absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-10',
            !agent && 'opacity-50',
          )}
          draggable={false}
          onError={(e) => {
            console.error('[PipelinePage] falha ao carregar table-pc.png', tablePcUrl, e);
          }}
        />

        {/* Avatar do agente — "sentado" na cadeira (parte inferior da workstation, sobre o tapete) */}
        <div className="absolute left-1/2 -translate-x-1/2 top-[52%] z-20">
          {agent ? (
            <AnimatedAgent agent={agent} />
          ) : (
            <div className="w-11 h-11 rounded-lg border-2 border-dashed border-[#cdcdd6] grid place-items-center bg-white/60 backdrop-blur-sm">
              <Plus size={16} className="text-muted" />
            </div>
          )}
        </div>

        {/* Balão de expressão estilo RPG Maker — acima da cabeça do agente */}
        <div className="absolute left-1/2 -translate-x-1/2 top-[12%] z-30 pointer-events-none">
          <AnimatePresence>
            {agent && balloon && <EmoteBalloon key={balloon.key} emoji={balloon.emoji} />}
          </AnimatePresence>
        </div>

        {/* Indicador "soltar aqui" durante drag */}
        {isOver && (
          <div className="absolute inset-x-2 -top-3 text-[10px] font-mono uppercase tracking-wide text-purple text-center bg-card rounded-md py-0.5 shadow-card">
            soltar
          </div>
        )}
      </div>

      {/* Posição (chip cinza) + nome (chip branco) — destacam contra o fundo escurecido */}
      <div className="mt-1.5 inline-flex px-2 py-0.5 rounded-md bg-[#7857FF] text-white text-[10.5px] font-mono font-semibold tabular-nums shadow-card">
        {agent ? `#${index + 1}` : '+'}
      </div>
      {agent && (
        <div
          className="mt-1 inline-flex max-w-[140px] px-2 py-0.5 rounded-md bg-white text-[#1a1a24] text-[11.5px] font-semibold shadow-card"
          title={agent.name}
        >
          <span className="truncate">{agent.name}</span>
        </div>
      )}
    </div>
  );
}

// Wrapper que aplica uma das 3 animações ao avatar do agente — escolhida
// aleatoriamente a cada montagem da página (re-sortida ao reabrir o Pipeline).
function AnimatedAgent({ agent }: { agent: Agent }) {
  const [variant] = useState<AnimationVariant>(() => randomAnimation());
  const { animate, transition } = useMemo(() => getAnimationProps(variant), [variant]);
  return (
    <motion.div
      animate={animate}
      transition={transition}
      style={{ originY: 1 }} // pivot no chão pra pulinho/zoom parecerem naturais
    >
      <DraggableAgent agent={agent} location="desk" />
    </motion.div>
  );
}

function WaitingRoom({ agents, busy }: { agents: Agent[]; busy: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: WAITING_ROOM_ID, disabled: busy });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        'bg-card rounded-2xl border border-border p-5 shadow-card transition',
        isOver && 'ring-2 ring-purple ring-offset-2 ring-offset-transparent',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Coffee size={14} className="text-secondary" />
          <span className="text-[13px] font-semibold text-secondary uppercase tracking-wider">
            Sala de espera
          </span>
        </div>
        <span className="text-[12px] text-muted tabular-nums">{agents.length} inativo(s)</span>
      </div>

      {/* "Sofá" simplificado + agentes em pé/relaxando */}
      <div
        className="relative rounded-xl p-5 min-h-[140px]"
        style={{
          backgroundColor: 'rgb(var(--bg-page))',
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Sofá longo decorativo no fundo */}
        <div
          className="absolute left-4 right-4 bottom-4 h-8 rounded-md bg-[#7c5cff]/15 border border-purple-ring"
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-wrap gap-3 items-center min-h-[88px]">
          {agents.length === 0 ? (
            <p className="text-[12.5px] text-muted italic mx-auto">
              Nenhum agente em espera — arraste um pra cá pra desativar.
            </p>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="flex flex-col items-center gap-1">
                <DraggableAgent agent={agent} location="waiting" />
                <span
                  className="text-[10.5px] text-muted truncate max-w-[80px]"
                  title={agent.name}
                >
                  {agent.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

// Balão de expressão estilo RPG Maker — círculo branco com tail apontando
// pra baixo, emoji centralizado. Anima "pop" (zoom + bounce de cima) na
// entrada, fade-out + shrink na saída.
function EmoteBalloon({ emoji }: { emoji: BalloonEmoji }) {
  return (
    <motion.div
      initial={{ scale: 0, y: 6, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, y: -4, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 16 }}
      className="relative"
    >
      <div className="w-10 h-10 bg-white rounded-full border-2 border-[#1a1a24] grid place-items-center shadow-cardHover">
        <span className="text-[18px] leading-none select-none" role="img" aria-label="balão">
          {emoji}
        </span>
      </div>
      {/* Tail apontando pra baixo (estilo RPG Maker) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-0 h-0"
        style={{
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '6px solid #1a1a24',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-[2px] w-0 h-0"
        style={{
          borderLeft: '3px solid transparent',
          borderRight: '3px solid transparent',
          borderTop: '4px solid #ffffff',
        }}
        aria-hidden="true"
      />
    </motion.div>
  );
}

function DraggableAgent({ agent, location }: { agent: Agent; location: Location }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${DRAGGABLE_PREFIX}${agent.id}`,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      title={`${agent.name} — arraste pra reposicionar`}
      className={cn(
        'rounded-lg cursor-grab active:cursor-grabbing touch-none transition shadow-card',
        // Origem fica "fantasma" enquanto o DragOverlay (em PipelinePage) renderiza o avatar que segue o cursor.
        isDragging && 'opacity-30 scale-95',
      )}
    >
      <BotAvatar
        seed={agent.icon || agent.slug}
        size={location === 'desk' ? 40 : 36}
        grayscale={location === 'waiting'}
      />
    </button>
  );
}
