import { useState } from 'react';
import { Folder, Database, User, Sparkles, FolderOpen } from 'lucide-react';
import { api } from '../ipc/api';
import type { AppConfig } from '../types';

interface FirstRunModalProps {
  initial: AppConfig & { activeDbPath: string };
  onComplete: (next: AppConfig & { activeDbPath: string; dbPathChanged: boolean }) => void;
}

export function FirstRunModal({ initial, onComplete }: FirstRunModalProps) {
  const [userName, setUserName] = useState(initial.userName);
  const [dbPath, setDbPath] = useState(initial.dbPath);
  const [workspacePath, setWorkspacePath] = useState(initial.workspacePath);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickDb = async () => {
    const picked = await api.app.pickFile({
      defaultPath: dbPath,
      title: 'Escolher arquivo do banco SQLite',
    });
    if (picked) setDbPath(picked);
  };

  const pickWorkspace = async () => {
    const picked = await api.app.pickDirectory({
      defaultPath: workspacePath,
      title: 'Escolher pasta de workspace',
    });
    if (picked) setWorkspacePath(picked);
  };

  const submit = async () => {
    const trimmedName = userName.trim();
    const trimmedDb = dbPath.trim();
    const trimmedWs = workspacePath.trim();
    if (!trimmedName) return setError('Informe seu nome.');
    if (!trimmedDb) return setError('Informe o caminho do banco de dados.');
    if (!trimmedWs) return setError('Informe a pasta do workspace.');
    setError(null);
    setSaving(true);
    try {
      const next = await api.app.setConfig({
        userName: trimmedName,
        dbPath: trimmedDb,
        workspacePath: trimmedWs,
        configured: true,
      });
      onComplete(next);
    } catch (e) {
      setError(`Falha ao salvar: ${String((e as Error).message ?? e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f1322]/60 backdrop-blur-sm grid place-items-center p-6">
      <div className="bg-white rounded-2xl shadow-cardHover w-full max-w-[560px] p-7">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #6d4aff, #8a6bff)' }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-primary leading-tight">Bem-vindo ao Freela Radar</h2>
            <p className="text-[13.5px] text-secondary mt-1">
              Antes de começar, precisamos de três informações para preparar seu ambiente local.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Como vamos te chamar?" icon={<User size={14} />}>
            <input
              autoFocus
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Seu nome"
              className={inputCls}
            />
          </Field>

          <Field
            label="Onde guardar o banco de dados (SQLite)?"
            icon={<Database size={14} />}
            help="Todos os dados do app (agentes, oportunidades, configurações) ficam neste arquivo."
          >
            <div className="flex gap-2">
              <input
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder="C:\caminho\para\freela-radar.db"
                className={inputCls + ' font-mono text-[12.5px]'}
              />
              <button type="button" onClick={pickDb} className={browseCls}>
                <FolderOpen size={14} /> Procurar
              </button>
            </div>
          </Field>

          <Field
            label="Pasta de workspace"
            icon={<Folder size={14} />}
            help="Onde os agentes vão salvar documentos, propostas e demais artefatos gerados."
          >
            <div className="flex gap-2">
              <input
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="C:\caminho\para\workspace"
                className={inputCls + ' font-mono text-[12.5px]'}
              />
              <button type="button" onClick={pickWorkspace} className={browseCls}>
                <FolderOpen size={14} /> Procurar
              </button>
            </div>
          </Field>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-[#fdf2f2] border border-[#f3c2c2] text-[12.5px] text-[#b91c1c]">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={submit}
            disabled={saving}
            className="h-[42px] px-5 rounded-xl bg-purple text-white text-[14px] font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Começar a usar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  help,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <span className="text-purple">{icon}</span>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {help && <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{help}</p>}
    </label>
  );
}

const inputCls = 'w-full h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-purple-ring flex-1 min-w-0';
const browseCls = 'h-[40px] px-3 rounded-xl border border-border bg-white text-[12.5px] font-medium text-primary flex items-center gap-1.5 hover:bg-[#f8f8fb] shrink-0';
