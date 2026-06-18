import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FolderOpen, X } from 'lucide-react';
import { useRadarStore } from '../store/useRadarStore';
import { BotAvatar } from './BotAvatar';
import { api } from '../ipc/api';
import { cn } from '../lib/utils';

// Emojis dos balões de expressão que aparecem sobre o agente (sorteados).
const BALLOON_EMOJIS = ['☕', '🕵️‍♂️', '📝', '💡', '👨‍💻', '✅', '💲'];

interface ActiveAgent {
  name: string;
  icon: string;
  index: number;
  total: number;
}
interface OppInfo {
  index: number;
  total: number;
  title: string;
}

/** Overlay com o progresso da execução do time de agentes + resultado final. */
export function TeamRunModal() {
  const runningTeam = useRadarStore((s) => s.runningTeam);
  const progress = useRadarStore((s) => s.teamProgress);
  const result = useRadarStore((s) => s.teamResult);
  const dismiss = useRadarStore((s) => s.dismissTeamResult);

  // Mantém o agente/oportunidade ativos "grudados" (só trocam em agent-start /
  // opp-start) pra não sumirem nos eventos intermediários (agent-done etc.).
  const [active, setActive] = useState<ActiveAgent | null>(null);
  const [opp, setOpp] = useState<OppInfo | null>(null);

  useEffect(() => {
    if (!progress) {
      setActive(null);
      setOpp(null);
      return;
    }
    if (progress.oppTitle) {
      setOpp({ index: progress.oppIndex ?? 1, total: progress.oppTotal ?? 1, title: progress.oppTitle });
    }
    if (progress.type === 'agent-start' && progress.agentName) {
      setActive({
        name: progress.agentName,
        icon: progress.agentIcon ?? progress.agentName,
        index: progress.agentIndex ?? 1,
        total: progress.agentTotal ?? 1,
      });
    }
  }, [progress]);

  const show = runningTeam || !!result;
  const done = !runningTeam && !!result;

  // Fração de progresso (oportunidades × agentes).
  let frac = 0;
  if (progress?.oppTotal) {
    const perOpp = 1 / progress.oppTotal;
    const oppBase = ((progress.oppIndex ?? 1) - 1) * perOpp;
    const within = progress.agentTotal ? ((progress.agentIndex ?? 0) / progress.agentTotal) * perOpp : 0;
    frac = Math.min(0.99, oppBase + within);
  }
  if (done) frac = 1;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/45 backdrop-blur-sm p-6"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="bg-card rounded-3xl border border-border shadow-cardHover px-12 py-10 w-full max-w-[460px] flex flex-col items-center gap-5"
          >
            {done ? (
              <ResultView result={result!} onClose={dismiss} />
            ) : (
              <RunningView active={active} opp={opp} frac={frac} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RunningView({ active, opp, frac }: { active: ActiveAgent | null; opp: OppInfo | null; frac: number }) {
  const agentKey = `${opp?.index ?? 0}-${active?.index ?? 0}`;

  // Balão de expressão: a cada intervalo, sorteia um emoji (sem repetir o
  // anterior) e dispara uma nova "pipoca" sobre o avatar.
  const [balloon, setBalloon] = useState<{ id: number; emoji: string } | null>(null);
  useEffect(() => {
    let id = 0;
    let last = '';
    const pick = () => {
      let e = BALLOON_EMOJIS[Math.floor(Math.random() * BALLOON_EMOJIS.length)];
      while (e === last && BALLOON_EMOJIS.length > 1) {
        e = BALLOON_EMOJIS[Math.floor(Math.random() * BALLOON_EMOJIS.length)];
      }
      last = e;
      return e;
    };
    const show = () => {
      id += 1;
      setBalloon({ id, emoji: pick() });
    };
    show();
    const interval = setInterval(show, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Scanner sobre o avatar do agente ativo (mesmo estilo da varredura) */}
      <div className="relative flex flex-col items-center gap-2.5 pt-7">
        {/* Balão de expressão — emoji sorteado, pipoca de tempo em tempo */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 z-20 pointer-events-none">
          <AnimatePresence>
            {balloon && (
              <motion.div
                key={balloon.id}
                initial={{ opacity: 0, y: 8, scale: 0.7 }}
                animate={{ opacity: [0, 1, 1, 0], y: [8, -4, -16, -30], scale: [0.7, 1, 1, 0.9] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl rounded-bl-sm bg-white border border-border shadow-card text-[16px]">
                  {balloon.emoji}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Moldura de scan: avatar sendo escaneado por um feixe que sobe e desce */}
        <div className="relative w-[96px] h-[96px] rounded-2xl overflow-hidden bg-purple-softer">
          {/* Avatar (troca: sai pela direita, próximo entra pela esquerda) */}
          <div className="absolute inset-0 grid place-items-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={agentKey}
                initial={{ x: -96, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 96, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute"
              >
                {active ? (
                  <BotAvatar seed={active.icon} size={64} />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-purple-soft" />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Feixe de varredura — sobe e desce continuamente */}
          <motion.div
            className="absolute inset-x-0 top-0 z-10"
            initial={{ y: 4 }}
            animate={{ y: [4, 90, 4] }}
            transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
          >
            <div className="absolute inset-x-0 -top-8 h-16 bg-gradient-to-b from-transparent via-purple/30 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-purple to-transparent shadow-[0_0_12px_2px_rgb(var(--purple)/0.65)]" />
          </motion.div>

          {/* Molduras de mira nos cantos */}
          <span className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-purple rounded-tl-md" />
          <span className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-purple rounded-tr-md" />
          <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-purple rounded-bl-md" />
          <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-purple rounded-br-md" />
        </div>

        {/* Nome do agente (troca com slide) */}
        <div className="relative h-5 w-[170px] overflow-hidden flex items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${agentKey}-name`}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="absolute whitespace-nowrap text-[12.5px] font-semibold text-primary"
            >
              {active?.name ?? 'Preparando…'}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Status da fila — qual agente está executando (abaixo do scanner) */}
      {active && (
        <div className="inline-flex items-center px-3 py-1 rounded-full bg-purple-soft text-purple text-[12.5px] font-semibold tabular-nums">
          Agente {active.index}/{active.total}
        </div>
      )}

      <div className="text-center">
        <div className="text-[16px] font-bold text-primary">Executando time de agentes</div>
        <p className="text-[12.5px] text-secondary mt-1">
          Cada vaga passa por todos os agentes em sequência (handoff).
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-2 rounded-full bg-[#f0f0f4] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-purple"
          animate={{ width: `${Math.round(frac * 100)}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Oportunidade atual */}
      <div className="w-full text-center min-h-[20px]">
        {opp && (
          <div className="text-[12.5px] text-secondary truncate">
            <span className="text-muted tabular-nums">
              Vaga {opp.index}/{opp.total}
            </span>{' '}
            · {opp.title}
          </div>
        )}
      </div>
    </>
  );
}

function ResultView({
  result,
  onClose,
}: {
  result: NonNullable<ReturnType<typeof useRadarStore.getState>['teamResult']>;
  onClose: () => void;
}) {
  const count = result.written.length;
  const hasErrors = result.errors.length > 0;

  const openFolder = async () => {
    await api.app.openWorkspaceDir('oportunidades');
  };

  return (
    <>
      {/* Animação de check */}
      <div className="relative w-20 h-20 grid place-items-center">
        {/* Onda que expande e some */}
        <motion.span
          className={cn('absolute w-16 h-16 rounded-full', hasErrors ? 'bg-amber/30' : 'bg-green/30')}
          initial={{ scale: 0.6, opacity: 0.7 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
        {/* Círculo com pop (spring) */}
        <motion.div
          className={cn(
            'relative w-16 h-16 rounded-full grid place-items-center',
            hasErrors ? 'bg-amber-soft text-amber' : 'bg-green-soft text-green',
          )}
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 15 }}
        >
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.16, type: 'spring', stiffness: 320, damping: 14 }}
          >
            <Check size={34} strokeWidth={3} />
          </motion.span>
        </motion.div>
      </div>

      <div className="text-center">
        <div className="text-[16px] font-bold text-primary">Time concluído</div>
        <p className="text-[13px] text-secondary mt-1">
          {count} documento{count === 1 ? '' : 's'} gerado{count === 1 ? '' : 's'} em{' '}
          <code className="font-mono text-[12px]">oportunidades/</code>.
        </p>
        {hasErrors && (
          <p className="text-[12px] text-amber mt-1.5">
            {result.errors.length} aviso(s)/erro(s) — registrados no markdown de cada vaga.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 w-full justify-center pt-1">
        <button
          onClick={openFolder}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-purple text-white text-[13.5px] font-semibold hover:opacity-90 transition"
        >
          <FolderOpen size={15} /> Abrir pasta
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border bg-white text-[13.5px] font-medium text-primary hover:bg-[#f8f8fb] transition"
        >
          <X size={15} /> Fechar
        </button>
      </div>
    </>
  );
}
