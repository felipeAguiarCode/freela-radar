import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanLine,
  Play,
  Square,
  Loader2,
  FolderOpen,
  Trash2,
  Timer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { api } from '../ipc/api';
import { cn } from '../lib/utils';
import { BotAvatar } from '../components/BotAvatar';
import { Confetti } from '../components/Confetti';
import type { ScrapperEvent } from '../ipc/api';

const DEFAULT_URL = 'https://www.workana.com/jobs?language=pt';
const URL_SETTING_KEY = 'scrapper.start_url';
const MAX_PAGES = 50;
const MAX_LINES = 800;
const CONFETTI_MS = 5200;

type LogLevel = NonNullable<ScrapperEvent['level']>;

interface LogLine {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: 'text-[#cbd5e1]',
  success: 'text-[#4ade80]',
  warn: 'text-[#fbbf24]',
  error: 'text-[#f87171]',
};

function nowTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isWorkanaUrl(raw: string): boolean {
  try {
    return /(^|\.)workana\.com$/i.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function ScrapperPage() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [pages, setPages] = useState(3);
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(5);
  const [maxPages, setMaxPages] = useState(MAX_PAGES);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [found, setFound] = useState(0);
  const [saved, setSaved] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [finished, setFinished] = useState<null | { ok: boolean; cancelled?: boolean; error?: string }>(null);

  const lineId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const confettiTimer = useRef<number | null>(null);

  const urlValid = useMemo(() => isWorkanaUrl(url), [url]);

  const pushLine = (text: string, level: LogLevel = 'info') => {
    // Mais recentes no TOPO: prepend e descarta as mais antigas (fim do array).
    setLines((prev) => {
      const next = [{ id: ++lineId.current, time: nowTime(), level, text }, ...prev];
      return next.length > MAX_LINES ? next.slice(0, MAX_LINES) : next;
    });
  };

  // Como o log é invertido (novo no topo), mantém o scroll no topo a cada linha.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = 0;
  }, [lines]);

  // Inicializa os campos a partir do que foi salvo no banco (última URL usada +
  // defaults de Settings → Playwright).
  useEffect(() => {
    api.settings
      .getAll()
      .then((rows) => {
        const m = new Map(rows.map((r) => [r.key, r.value]));
        const savedUrl = m.get(URL_SETTING_KEY);
        // Só restaura se o usuário ainda não mexeu no campo (evita clobber).
        if (savedUrl) setUrl((cur) => (cur === DEFAULT_URL ? savedUrl : cur));
        const minMs = Number(m.get('playwright.delay_min_ms'));
        const maxMs = Number(m.get('playwright.delay_max_ms'));
        const cap = Number(m.get('playwright.max_pages'));
        if (m.get('playwright.delay_min_ms') && Number.isFinite(minMs)) setDelayMin(minMs / 1000);
        if (m.get('playwright.delay_max_ms') && Number.isFinite(maxMs)) setDelayMax(maxMs / 1000);
        if (Number.isFinite(cap) && cap > 0) setMaxPages(cap);
      })
      .catch(() => {});
  }, []);

  // Persiste a URL inicial no banco (última usada). Chamada no blur e ao iniciar.
  const persistUrl = (value: string) => {
    const v = value.trim();
    if (v) api.settings.set(URL_SETTING_KEY, v).catch(() => {});
  };

  const celebrate = () => {
    setShowConfetti(true);
    if (confettiTimer.current) window.clearTimeout(confettiTimer.current);
    confettiTimer.current = window.setTimeout(() => setShowConfetti(false), CONFETTI_MS);
  };

  // Assina o streaming de progresso da raspagem (montado uma vez).
  useEffect(() => {
    const off = api.scrapper.onEvent((evt: ScrapperEvent) => {
      // Qualquer evento que carregue contadores atualiza os números do topo.
      if (typeof evt.totalJobs === 'number') setFound(evt.totalJobs);
      if (typeof evt.savedJobs === 'number') setSaved(evt.savedJobs);

      switch (evt.type) {
        case 'start':
          pushLine(`🚀 Iniciando raspagem do Workana · ${evt.totalPages ?? '?'} página(s)`, 'info');
          break;
        case 'page':
          pushLine(evt.message ?? `📄 Página ${evt.page}/${evt.totalPages}`, evt.level ?? 'info');
          break;
        case 'log':
          pushLine(evt.message ?? '', evt.level ?? 'info');
          break;
        case 'job': {
          const j = evt.job;
          if (j) {
            const budget = j.budget ? ` — ${j.budget}` : '';
            const tags = j.tags?.length ? `  🏷️ ${j.tags.slice(0, 4).join(', ')}` : '';
            pushLine(`💾 ${j.title}${budget}${tags}`, 'success');
          }
          break;
        }
        case 'done':
          pushLine(
            `🎉 Concluído — ${evt.savedJobs ?? 0} vaga(s) salva(s) de ${evt.totalJobs ?? 0} detectada(s)`,
            'success',
          );
          celebrate();
          break;
        case 'cancelled':
          pushLine(`🛑 Raspagem cancelada — ${evt.savedJobs ?? 0} vaga(s) salva(s)`, 'warn');
          break;
        case 'error':
          pushLine(`❌ ${evt.error ?? 'Erro desconhecido'}`, 'error');
          break;
      }
    });
    return () => {
      off();
      if (confettiTimer.current) window.clearTimeout(confettiTimer.current);
    };
  }, []);

  const handleStart = async () => {
    if (running || !urlValid) return;
    persistUrl(url); // guarda a URL usada como última no banco
    const clampedPages = Math.max(1, Math.min(maxPages, Math.floor(pages) || 1));
    const minMs = Math.max(0, Math.round((Number(delayMin) || 0) * 1000));
    const maxMs = Math.max(minMs, Math.round((Number(delayMax) || 0) * 1000));
    setRunning(true);
    setFinished(null);
    setShowConfetti(false);
    setFound(0);
    setSaved(0);
    setLines([]);
    try {
      // headless e demais opções de engine vêm de Settings → Playwright.
      const res = await api.scrapper.start({
        url,
        pages: clampedPages,
        delayMinMs: minMs,
        delayMaxMs: maxMs,
      });
      setFinished({ ok: res.ok, cancelled: res.error === 'cancelado', error: res.ok ? undefined : res.error });
    } catch (e) {
      const msg = (e as Error).message;
      pushLine(`❌ Falha ao iniciar: ${msg}`, 'error');
      setFinished({ ok: false, error: msg });
    } finally {
      setRunning(false);
    }
  };

  const handleStop = async () => {
    pushLine('🛑 Solicitando cancelamento…', 'warn');
    await api.scrapper.cancel();
  };

  const openFreelas = async () => {
    await api.opportunities.openFreelasDir();
  };

  const botJumping = running || showConfetti;

  return (
    <div className="h-full overflow-y-auto">
      {showConfetti && <Confetti />}
      <div className="max-w-5xl mx-auto px-8 py-7">
        {/* Cabeçalho com mascote */}
        <header className="flex items-center gap-2 mb-6">
          <BotMascot jumping={botJumping} />
          <div>
            <h1 className="text-[20px] font-bold text-primary leading-tight">Scrapper</h1>
            <p className="text-[13px] text-secondary mt-0.5">
              Raspa vagas do Workana, abre cada uma para ler a descrição completa e grava em{' '}
              <code className="font-mono">freelas/</code> no formato JSON do radar.
            </p>
          </div>
        </header>

        {/* Painel de configuração */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card mb-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            <label className="block min-w-0">
              <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">
                URL inicial (Workana)
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={(e) => persistUrl(e.target.value)}
                disabled={running}
                placeholder="https://www.workana.com/jobs?language=pt"
                className={cn(
                  inputCls,
                  'mt-1.5 font-mono text-[13px]',
                  !urlValid && url.trim() !== '' && 'border-[#dc2626] focus:border-[#dc2626]',
                )}
              />
            </label>

            <label className="block w-[100px]">
              <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">
                Páginas
              </span>
              <input
                type="number"
                min={1}
                max={maxPages}
                value={pages}
                onChange={(e) => setPages(Number(e.target.value))}
                disabled={running}
                className={cn(inputCls, 'mt-1.5 tabular-nums')}
              />
            </label>

            <div className="block">
              <span className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-1">
                <Timer size={12} /> Pausa aleatória (s)
              </span>
              <div
                className="mt-1.5 flex items-center gap-1.5"
                title="A cada vaga, espera um tempo sorteado entre o mínimo e o máximo (anti-spam)"
              >
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Number(e.target.value))}
                  disabled={running}
                  aria-label="Pausa mínima em segundos"
                  className={cn(inputCls, 'w-[68px] tabular-nums text-center')}
                />
                <span className="text-muted text-[13px]">–</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={delayMax}
                  onChange={(e) => setDelayMax(Number(e.target.value))}
                  disabled={running}
                  aria-label="Pausa máxima em segundos"
                  className={cn(inputCls, 'w-[68px] tabular-nums text-center')}
                />
              </div>
            </div>

            {running ? (
              <button
                onClick={handleStop}
                className="h-[40px] px-4 rounded-xl bg-[#dc2626] text-white text-[13.5px] font-semibold flex items-center gap-2 hover:bg-[#b91c1c] transition shrink-0"
              >
                <Square size={14} fill="currentColor" />
                Parar
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!urlValid}
                title={!urlValid ? 'Informe uma URL válida do workana.com' : 'Iniciar raspagem'}
                className="h-[40px] px-4 rounded-xl bg-purple text-white text-[13.5px] font-semibold flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Play size={14} fill="currentColor" />
                Iniciar raspagem
              </button>
            )}
          </div>

          {!urlValid && url.trim() !== '' && (
            <p className="text-[12px] text-[#dc2626] mt-2">
              A URL precisa ser do domínio <strong>workana.com</strong>.
            </p>
          )}
        </div>

        {/* Console de varredura em tempo real */}
        <div className="rounded-2xl border border-border overflow-hidden shadow-card">
          {/* Barra de status do console */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b0e1a] border-b border-[#1f2433]">
            <div className="flex items-center gap-2.5 text-[12.5px]">
              {running ? (
                <Loader2 size={14} className="text-purple animate-spin" />
              ) : finished?.ok ? (
                <CheckCircle2 size={14} className="text-[#4ade80]" />
              ) : finished && !finished.ok ? (
                finished.cancelled ? (
                  <AlertTriangle size={14} className="text-[#fbbf24]" />
                ) : (
                  <XCircle size={14} className="text-[#f87171]" />
                )
              ) : (
                <ScanLine size={14} className="text-[#64748b]" />
              )}
              <span className="font-mono text-[#cbd5e1]">
                {running
                  ? 'Varrendo…'
                  : finished?.ok
                    ? 'Concluído'
                    : finished?.cancelled
                      ? 'Cancelado'
                      : finished && !finished.ok
                        ? 'Erro'
                        : 'Pronto'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[12px] font-mono">
              <span className="text-[#94a3b8]">
                detectadas <span className="text-[#cbd5e1] tabular-nums">{found}</span>
              </span>
              <span className="text-[#94a3b8]">
                salvas <span className="text-[#4ade80] tabular-nums">{saved}</span>
              </span>
            </div>
          </div>

          {/* Linhas do log */}
          <div
            ref={logRef}
            className="bg-[#0f1322] h-[420px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed"
          >
            {lines.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-[#475569]">
                <div>
                  <ScanLine size={28} className="mx-auto mb-2 opacity-60" />
                  <p className="text-[13px]">
                    O log da varredura aparece aqui em tempo real.
                    <br />
                    Configure a URL e clique em <span className="text-[#94a3b8]">Iniciar raspagem</span>.
                  </p>
                </div>
              </div>
            ) : (
              lines.map((l) => (
                <div key={l.id} className="flex gap-2.5 whitespace-pre-wrap break-words">
                  <span className="text-[#475569] shrink-0 tabular-nums select-none">{l.time}</span>
                  <span className={cn('flex-1 min-w-0', LEVEL_COLOR[l.level])}>{l.text}</span>
                </div>
              ))
            )}
          </div>

          {/* Rodapé de ações */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b0e1a] border-t border-[#1f2433]">
            <button
              onClick={() => setLines([])}
              disabled={running || lines.length === 0}
              className="h-8 px-3 rounded-lg text-[12.5px] font-medium text-[#94a3b8] hover:text-[#cbd5e1] hover:bg-[#1f2433] transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              Limpar log
            </button>
            <button
              onClick={openFreelas}
              className="h-8 px-3 rounded-lg text-[12.5px] font-medium text-[#cbd5e1] bg-[#1f2433] hover:bg-[#2a3146] transition flex items-center gap-1.5"
            >
              <FolderOpen size={13} />
              Abrir pasta freelas
            </button>
          </div>
        </div>

        {/* Resumo final */}
        {finished && !running && (
          <div
            className={cn(
              'mt-4 px-4 py-3 rounded-xl border text-[13px] flex items-center gap-2.5',
              finished.ok
                ? 'bg-green-soft border-[#bbf7d0] text-[#166534]'
                : finished.cancelled
                  ? 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
                  : 'bg-[#fdf2f2] border-[#f3c2c2] text-[#b91c1c]',
            )}
          >
            {finished.ok ? (
              <CheckCircle2 size={16} />
            ) : finished.cancelled ? (
              <AlertTriangle size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span>
              {finished.ok
                ? `Raspagem concluída — ${saved} vaga(s) salva(s) em freelas/. Rode uma varredura no Radar para classificá-las por match.`
                : finished.cancelled
                  ? `Raspagem cancelada — ${saved} vaga(s) salva(s) até o cancelamento.`
                  : `Falha na raspagem: ${finished.error ?? 'erro desconhecido'}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mascote bot que pula (estilo Bomberman do SNES) enquanto a raspagem roda. */
function BotMascot({ jumping }: { jumping: boolean }) {
  return (
    <div className="relative w-[88px] h-[84px] shrink-0 grid place-items-end justify-items-center">
      <div
        style={jumping ? { animation: 'bomberman-jump 0.7s ease-in-out infinite' } : undefined}
        className="origin-bottom"
      >
        <BotAvatar seed="scrappy-mc-scrapface" size={68} colorful grayscale={!jumping} />
      </div>
      {/* Sombra no chão — encolhe em sincronia com o pulo */}
      <div
        style={jumping ? { animation: 'bomberman-shadow 0.7s ease-in-out infinite' } : undefined}
        className="absolute bottom-0 w-12 h-2 rounded-[50%] bg-black/25"
      />
    </div>
  );
}

const inputCls =
  'w-full h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-purple-ring';
