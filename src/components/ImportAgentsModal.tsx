import { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X } from 'lucide-react';
import { BotAvatar } from './BotAvatar';

export interface ImportCandidate {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  soul_prompt?: string;
  system_prompt?: string;
  [k: string]: unknown;
}

interface Props {
  candidates: ImportCandidate[];
  importing?: boolean;
  onCancel: () => void;
  onConfirm: (selected: ImportCandidate[]) => void;
}

/** Janela intermediária do import: lista os agentes do JSON e deixa marcar
 *  via checkbox quais de fato serão trazidos para o estúdio. */
export function ImportAgentsModal({ candidates, importing, onCancel, onConfirm }: Props) {
  const [checked, setChecked] = useState<boolean[]>(() => candidates.map(() => true));

  const selectedCount = checked.filter(Boolean).length;
  const allChecked = candidates.length > 0 && selectedCount === candidates.length;

  const toggle = (i: number) => setChecked((p) => p.map((v, idx) => (idx === i ? !v : v)));
  const toggleAll = () => {
    const next = !allChecked;
    setChecked(candidates.map(() => next));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onCancel}
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 backdrop-blur-sm p-6"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-2xl border border-border shadow-cardHover w-full max-w-[540px] max-h-[82vh] flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-purple-soft text-purple grid place-items-center shrink-0">
            <Upload size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold text-primary">Importar time de agentes</h2>
            <p className="text-[12.5px] text-secondary mt-0.5">
              Marque quais agentes deste arquivo você quer trazer para o seu estúdio.
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Fechar"
            className="w-7 h-7 rounded-md grid place-items-center text-muted hover:text-primary hover:bg-[#f5f5f7] transition shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selecionar todos */}
        <div className="px-5 py-2.5 border-b border-border flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-[12.5px] font-medium text-secondary">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 cursor-pointer"
              style={{ accentColor: 'rgb(var(--purple))' }}
            />
            Selecionar todos
          </label>
          <span className="text-[12px] text-muted tabular-nums">
            {selectedCount} de {candidates.length}
          </span>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto px-3 py-2 flex-1">
          {candidates.map((c, i) => (
            <label
              key={i}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f8f8fb] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={checked[i] ?? false}
                onChange={() => toggle(i)}
                className="w-4 h-4 cursor-pointer shrink-0"
                style={{ accentColor: 'rgb(var(--purple))' }}
              />
              <BotAvatar seed={c.icon || c.slug || c.name || `agent-${i}`} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-primary truncate">{c.name || 'Sem nome'}</div>
                <div className="text-[12px] text-muted truncate">
                  {c.description || c.system_prompt?.slice(0, 90) || c.soul_prompt?.slice(0, 90) || '—'}
                </div>
              </div>
              {Array.isArray(c.tools) && c.tools.length > 0 && (
                <span className="shrink-0 text-[11px] font-medium text-secondary bg-[#f5f5f7] rounded-full px-2 py-0.5">
                  {c.tools.length} {c.tools.length === 1 ? 'ferramenta' : 'ferramentas'}
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-10 px-4 rounded-xl border border-border bg-white text-[13.5px] font-medium text-primary hover:bg-[#f8f8fb] transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(candidates.filter((_, i) => checked[i]))}
            disabled={selectedCount === 0 || importing}
            className="h-10 px-4 rounded-xl bg-purple text-white text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {importing ? 'Importando…' : `Importar (${selectedCount})`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
