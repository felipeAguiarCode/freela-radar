import { useEffect, useRef, useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { api } from '../ipc/api';
import type { RadarTag } from '../types';

interface EditTagsModalProps {
  tags: RadarTag[];
  onClose: () => void;
  onChanged: () => void; // chamado depois de qualquer mutação bem-sucedida
}

export function EditTagsModal({ tags, onClose, onChanged }: EditTagsModalProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o campo ao abrir (mais confiável que `autoFocus` sob re-renders).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addTag = async () => {
    const name = draft.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError('Essa tag já existe.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.tags.create(name);
      setDraft('');
      onChanged();
    } catch (e) {
      setError(`Falha ao adicionar: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
      // Devolve o foco ao input pra continuar digitando (ex.: após clicar no botão).
      inputRef.current?.focus();
    }
  };

  const removeTag = async (tag: RadarTag) => {
    if (!window.confirm(`Remover a tag "${tag.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.tags.delete(tag.id);
      onChanged();
    } catch (e) {
      setError(`Falha ao remover: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-[#0f1322]/55 backdrop-blur-sm grid place-items-center p-6 app-no-drag"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-cardHover w-full max-w-[520px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-soft text-purple grid place-items-center shrink-0">
              <TagIcon size={18} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-primary leading-tight">Editar tags monitoradas</h2>
              <p className="text-[13px] text-secondary mt-0.5">
                Defina quais palavras-chave o radar deve perseguir nas oportunidades.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg hover:bg-[#f5f5f7] grid place-items-center text-secondary"
          >
            <X size={16} />
          </button>
        </header>

        {/* Adicionar */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Nova tag (ex: react, automação, integrações…)"
            className="flex-1 h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-purple-ring"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addTag}
            disabled={busy || !draft.trim()}
            className="h-[40px] px-4 rounded-xl bg-purple text-white text-[13px] font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={14} />
            Adicionar
          </button>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[#fdf2f2] border border-[#f3c2c2] text-[12.5px] text-[#b91c1c]">
            {error}
          </div>
        )}

        {/* Lista */}
        <div className="mt-5">
          <div className="text-[12px] font-semibold text-secondary uppercase tracking-wider mb-2">
            {tags.length} {tags.length === 1 ? 'tag cadastrada' : 'tags cadastradas'}
          </div>
          {tags.length === 0 ? (
            <p className="text-[13px] text-secondary py-3">Nenhuma tag ainda. Adicione a primeira acima.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className="inline-flex items-center h-[30px] pl-3 pr-1 rounded-full border border-purple-ring bg-purple-softer text-purple text-[13px] font-medium gap-1"
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    disabled={busy}
                    aria-label={`Remover tag ${t.name}`}
                    className="w-6 h-6 grid place-items-center rounded-full hover:bg-white/60 transition disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="h-[40px] px-4 rounded-xl border border-border bg-white text-[13.5px] font-medium text-primary hover:bg-[#f8f8fb]"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
