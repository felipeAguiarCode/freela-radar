import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, FileJson, X } from 'lucide-react';
import { TagChip } from './TagChip';
import { PlatformIcon } from './PlatformIcon';
import { api } from '../ipc/api';
import { formatBudgetBRL, relativeTime, safeParseJson } from '../lib/utils';
import type { Opportunity, MonitoredSite } from '../types';

interface OpportunityRowProps {
  opportunity: Opportunity;
  site?: MonitoredSite;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function OpportunityRow({ opportunity, site, selected, onToggleSelect }: OpportunityRowProps) {
  const [open, setOpen] = useState(false);
  // Tags já vêm detectadas dinamicamente no backend (tags monitoradas
  // encontradas no título + descrição). Aqui só exibimos as labels.
  const tags = safeParseJson<string[]>(opportunity.detected_tags, []);
  const platformSlug = site?.slug ?? guessPlatformFromUrl(opportunity.source_url ?? '');
  const sourceLabel = site?.name ?? prettyPlatform(platformSlug);

  // Abre o arquivo JSON da vaga no app padrão do SO — rastreabilidade.
  const openJson = async () => {
    const r = await api.opportunities.openJson(opportunity.id);
    if (!r.ok) console.warn('[OpportunityRow] não abriu o JSON:', r.error);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        title="Ver descrição completa"
        className="group grid grid-cols-[22px_36px_1.4fr_2fr_auto_28px] gap-4 items-center py-3 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-[#f8f8fb] border-b border-border last:border-0 transition-colors"
      >
        {/* Checkbox de seleção (default desmarcado) — para "Executar agentes" */}
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect?.()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Selecionar esta oportunidade"
          title="Selecionar para executar o time de agentes"
          className="w-4 h-4 cursor-pointer"
          style={{ accentColor: 'rgb(var(--purple))' }}
        />
        <PlatformIcon platform={platformSlug} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-primary truncate">{opportunity.title}</div>
          <div className="text-[12px] text-muted mt-0.5">
            {sourceLabel} · {relativeTime(opportunity.found_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((t) => (
            <TagChip key={t} variant="purple">
              {t}
            </TagChip>
          ))}
        </div>
        <div className="text-right">
          <div className="text-[12.5px] font-semibold text-[#16a34a]">{opportunity.match_score}% match</div>
          <div className="text-[12.5px] text-secondary mt-0.5">
            {formatBudgetBRL(opportunity.budget_min, opportunity.budget_max, opportunity.currency)}
          </div>
        </div>
        {/* Botão discreto: abre o .json da vaga (rastreabilidade) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openJson();
          }}
          title="Abrir o arquivo JSON desta vaga"
          aria-label="Abrir o arquivo JSON desta vaga"
          className="w-7 h-7 rounded-md grid place-items-center text-muted opacity-40 hover:text-primary hover:bg-[#f5f5f7] hover:opacity-100 group-hover:opacity-100 transition"
        >
          <FileJson size={14} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <OpportunityDetailModal
            opportunity={opportunity}
            sourceLabel={sourceLabel}
            platformSlug={platformSlug}
            tags={tags}
            onClose={() => setOpen(false)}
            onOpenJson={openJson}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface DetailModalProps {
  opportunity: Opportunity;
  sourceLabel: string;
  platformSlug: string;
  tags: string[];
  onClose: () => void;
  onOpenJson: () => void;
}

function OpportunityDetailModal({
  opportunity,
  sourceLabel,
  platformSlug,
  tags,
  onClose,
  onOpenJson,
}: DetailModalProps) {
  // Fecha com Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const description = (opportunity.description ?? '').trim();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[55] grid place-items-center bg-black/40 backdrop-blur-sm p-6"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-2xl border border-border shadow-cardHover w-full max-w-[560px] max-h-[80vh] flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <PlatformIcon platform={platformSlug} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-primary leading-snug">{opportunity.title}</h2>
            <div className="text-[12px] text-muted mt-1">
              {sourceLabel} · {relativeTime(opportunity.found_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-7 h-7 rounded-md grid place-items-center text-muted hover:text-primary hover:bg-[#f5f5f7] transition shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Meta: match + orçamento + tags */}
        <div className="px-5 pt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] font-semibold text-[#16a34a]">{opportunity.match_score}% match</span>
          <span className="text-[13px] text-secondary">
            {formatBudgetBRL(opportunity.budget_min, opportunity.budget_max, opportunity.currency)}
          </span>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <TagChip key={t} variant="purple">
                  {t}
                </TagChip>
              ))}
            </div>
          )}
        </div>

        {/* Descrição completa (rolável) */}
        <div className="px-5 py-4 overflow-y-auto">
          <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2">Descrição</div>
          {description ? (
            <p className="text-[14px] text-primary leading-relaxed whitespace-pre-wrap">{description}</p>
          ) : (
            <p className="text-[13px] text-muted italic">Sem descrição neste documento.</p>
          )}
        </div>

        {/* Rodapé: ações */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          {opportunity.source_url && (
            <a
              href={opportunity.source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-white text-[13px] font-medium text-primary hover:bg-[#f8f8fb] transition"
            >
              <ExternalLink size={14} /> Ver no site
            </a>
          )}
          <button
            onClick={onOpenJson}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-white text-[13px] font-medium text-primary hover:bg-[#f8f8fb] transition"
          >
            <FileJson size={14} /> Abrir JSON
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function guessPlatformFromUrl(url: string): string {
  if (!url) return 'unknown';
  if (url.includes('workana')) return 'workana';
  if (url.includes('99freelas')) return '99freelas';
  if (url.includes('freelancer')) return 'freelancer';
  if (url.includes('upwork')) return 'upwork';
  if (url.includes('remoteok')) return 'remoteok';
  return 'unknown';
}

function prettyPlatform(slug: string): string {
  const m: Record<string, string> = {
    workana: 'Workana',
    '99freelas': '99Freelas',
    freelancer: 'Freelancer.com',
    upwork: 'Upwork',
    remoteok: 'RemoteOK',
  };
  return m[slug] ?? slug;
}
