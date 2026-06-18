import { useEffect, useState } from 'react';
import { Save, X, Settings as SettingsIcon, Sliders, Key, Target, FolderOpen, ScanLine, type LucideIcon } from 'lucide-react';
import { api } from '../ipc/api';
import { cn } from '../lib/utils';
import type { AppConfig } from '../types';

type Tab = 'geral' | 'claude' | 'playwright' | 'chaves' | 'match';

const TABS: Array<{ key: Tab; label: string; Icon: LucideIcon }> = [
  { key: 'geral',      label: 'Geral', Icon: SettingsIcon },
  { key: 'claude',     label: 'Claude', Icon: Sliders },
  { key: 'playwright', label: 'Playwright', Icon: ScanLine },
  { key: 'chaves',     label: 'Chaves', Icon: Key },
  { key: 'match',      label: 'Match Engine', Icon: Target },
];

// System prompt padrão exibido na aba Playwright (espelha o default do backend).
const DEFAULT_PLAYWRIGHT_SYSTEM_PROMPT =
  'Você é um agente de raspagem de vagas do Workana. Extraia título, descrição completa, ' +
  'orçamento, skills e URL de cada oportunidade com fidelidade ao original, sem inventar dados. ' +
  'Preserve o texto em português e normalize apenas espaços e quebras de linha.';

// User-Agent padrão (espelha o WORKANA_UA do backend).
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface SettingsPageProps {
  onConfigChanged?: () => void;
  onThemeChange?: (theme: string) => void;
}

export function SettingsPage({ onConfigChanged, onThemeChange }: SettingsPageProps = {}) {
  const [tab, setTab] = useState<Tab>('geral');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [appCfg, setAppCfg] = useState<(AppConfig & { activeDbPath: string }) | null>(null);
  const [appCfgDirty, setAppCfgDirty] = useState(false);

  useEffect(() => {
    api.settings.getAll().then((rows) => {
      const map: Record<string, string> = {};
      const fixesToPersist: Array<[string, string]> = [];
      for (const r of rows) {
        let key = r.key;
        let value = r.value;
        // Sanitização legada — typo do specs.txt antigo: `--cloud-p` na verdade é `-p`.
        if (key === 'claude.flags' && value.includes('--cloud-p')) {
          value = value.replace(/--cloud-p/g, '-p');
          fixesToPersist.push([key, value]);
        }
        if (key === 'claude.cloud_p') {
          key = 'claude.print_mode';
          fixesToPersist.push([key, value]);
        }
        map[key] = value;
      }
      setValues(map);
      // Re-grava as chaves migradas pra que o DB também fique limpo,
      // mesmo se o usuário não reiniciar o app.
      for (const [k, v] of fixesToPersist) {
        api.settings.set(k, v).catch(() => {});
      }
    });
    api.app.getConfig().then(setAppCfg);
  }, []);

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  const setApp = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setAppCfg((c) => (c ? { ...c, [key]: value } : c));
    setAppCfgDirty(true);
  };

  const pickDb = async () => {
    const picked = await api.app.pickFile({ defaultPath: appCfg?.dbPath, title: 'Escolher banco de dados' });
    if (picked) setApp('dbPath', picked);
  };

  const pickWorkspace = async () => {
    const picked = await api.app.pickDirectory({ defaultPath: appCfg?.workspacePath, title: 'Escolher workspace' });
    if (picked) setApp('workspacePath', picked);
  };

  const save = async () => {
    const entries = Object.entries(dirty).filter(([, v]) => v).map(([k]) => k);
    await Promise.all(entries.map((k) => api.settings.set(k, values[k] ?? '')));
    setDirty({});

    let dbPathChanged = false;
    if (appCfgDirty && appCfg) {
      const result = await api.app.setConfig({
        userName: appCfg.userName,
        dbPath: appCfg.dbPath,
        workspacePath: appCfg.workspacePath,
      });
      setAppCfg(result);
      setAppCfgDirty(false);
      dbPathChanged = result.dbPathChanged;
      onConfigChanged?.();
    }

    setToast('Configurações salvas');
    setTimeout(() => setToast(null), 2400);

    if (dbPathChanged) {
      const ok = window.confirm(
        'O caminho do banco de dados foi alterado. O app precisa reiniciar para abrir o novo banco. Reiniciar agora?',
      );
      if (ok) await api.app.restart();
    }
  };

  const anyDirty = Object.keys(dirty).length > 0 || appCfgDirty;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-7">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-bold text-primary">Settings</h1>
            <p className="text-[13px] text-secondary mt-1">Configurações do Freela Radar</p>
          </div>
          <button
            onClick={save}
            disabled={!anyDirty}
            className="h-[40px] px-4 rounded-xl bg-purple text-white text-[13.5px] font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> Salvar alterações
          </button>
        </header>

        <div className="grid grid-cols-[220px_1fr] gap-6">
          <nav className="flex flex-col gap-1">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] font-medium transition text-left',
                  tab === key ? 'bg-purple-soft text-purple' : 'text-primary hover:bg-[#f7f7fb]',
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <div className="space-y-5">
            {tab === 'geral' && (
              <>
                <Card title="Identidade & locais">
                  <Field label="Seu nome">
                    <input
                      value={appCfg?.userName ?? ''}
                      onChange={(e) => setApp('userName', e.target.value)}
                      placeholder="Como o app deve te chamar"
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    label="Banco de dados (SQLite)"
                    help={
                      appCfg && appCfg.dbPath !== appCfg.activeDbPath
                        ? `Em uso agora: ${appCfg.activeDbPath} — reinicie o app após salvar para abrir o novo banco.`
                        : 'Local do arquivo .db. Trocar este caminho exige reiniciar o app.'
                    }
                  >
                    <div className="flex gap-2">
                      <input
                        value={appCfg?.dbPath ?? ''}
                        onChange={(e) => setApp('dbPath', e.target.value)}
                        className={inputCls + ' font-mono text-[12.5px]'}
                      />
                      <button type="button" onClick={pickDb} className={browseCls}>
                        <FolderOpen size={14} /> Procurar
                      </button>
                    </div>
                  </Field>
                  <Field
                    label="Pasta de workspace"
                    help={`Onde os agentes salvam documentos, propostas e artefatos gerados. Cada execução cria um arquivo em '${appCfg?.workspacePath ?? '…'}/executions/'.`}
                  >
                    <div className="flex gap-2">
                      <input
                        value={appCfg?.workspacePath ?? ''}
                        onChange={(e) => setApp('workspacePath', e.target.value)}
                        className={inputCls + ' font-mono text-[12.5px]'}
                      />
                      <button type="button" onClick={pickWorkspace} className={browseCls}>
                        <FolderOpen size={14} /> Procurar
                      </button>
                      <button
                        type="button"
                        disabled={!appCfg?.workspacePath}
                        onClick={() => appCfg?.workspacePath && api.app.openPath(appCfg.workspacePath)}
                        title="Abrir workspace no Explorador de arquivos"
                        className={browseCls + ' disabled:opacity-50'}
                      >
                        <FolderOpen size={14} /> Abrir
                      </button>
                    </div>
                  </Field>
                </Card>

                <Card
                  title="Pastas de saída"
                  subtitle="Nomes das subpastas dentro do workspace. Mude se quiser organizar de outro jeito — passa a valer na próxima leitura/gravação."
                >
                  <Field
                    label="Oportunidades — resultados do time de agentes"
                    help="Onde o “Executar agentes” grava o markdown final de cada vaga."
                  >
                    <input
                      value={values['workspace.dir.oportunidades'] ?? 'oportunidades'}
                      onChange={(e) => set('workspace.dir.oportunidades', e.target.value)}
                      className={inputCls + ' font-mono text-[12.5px]'}
                      placeholder="oportunidades"
                    />
                  </Field>
                  <Field
                    label="Freelas — vagas (fonte de verdade)"
                    help="Pasta de onde a varredura lê os JSONs das vagas."
                  >
                    <input
                      value={values['workspace.dir.freelas'] ?? 'freelas'}
                      onChange={(e) => set('workspace.dir.freelas', e.target.value)}
                      className={inputCls + ' font-mono text-[12.5px]'}
                      placeholder="freelas"
                    />
                  </Field>
                  <Field
                    label="Executions — execuções de agentes"
                    help="Onde cada execução individual de agente salva seu artefato."
                  >
                    <input
                      value={values['workspace.dir.executions'] ?? 'executions'}
                      onChange={(e) => set('workspace.dir.executions', e.target.value)}
                      className={inputCls + ' font-mono text-[12.5px]'}
                      placeholder="executions"
                    />
                  </Field>
                  <p className="text-[12px] text-secondary">
                    Use apenas o nome da pasta (sem barras). Renomear aqui <strong>não move</strong> os
                    arquivos já existentes na pasta antiga.
                  </p>
                </Card>

                <Card title="Aparência">
                  <Field label="Tema">
                    <select
                      value={values['general.theme'] ?? 'light'}
                      onChange={(e) => {
                        set('general.theme', e.target.value);
                        onThemeChange?.(e.target.value);
                      }}
                      className={inputCls}
                    >
                      <option value="light">Claro</option>
                      <option value="dio">dio.me theme</option>
                    </select>
                  </Field>
                  <Field label="Idioma">
                    <select value={values['general.language'] ?? 'pt-BR'} onChange={(e) => set('general.language', e.target.value)} className={inputCls}>
                      <option value="pt-BR">Português (BR)</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label="Backup automático">
                    <select value={values['general.auto_backup'] ?? 'true'} onChange={(e) => set('general.auto_backup', e.target.value)} className={inputCls}>
                      <option value="true">Ativado</option>
                      <option value="false">Desativado</option>
                    </select>
                  </Field>
                </Card>
              </>
            )}

            {tab === 'claude' && (
              <>
                <Card title="CLI" subtitle="Binário do Claude e argumentos passados na execução.">
                  <Field
                    label="Caminho do Claude CLI"
                    help="Use o nome do executável se estiver no PATH (ex: `claude`), ou caminho absoluto."
                  >
                    <input
                      value={values['claude.cli_path'] ?? 'claude'}
                      onChange={(e) => set('claude.cli_path', e.target.value)}
                      className={inputCls}
                      placeholder="claude"
                    />
                  </Field>
                  <Field
                    label="Flags (JSON array)"
                    help="Argumentos passados ao Claude CLI. `-p` ativa o modo print (necessário para automação)."
                  >
                    <input
                      value={values['claude.flags'] ?? '["-p","--dangerously-skip-permissions"]'}
                      onChange={(e) => set('claude.flags', e.target.value)}
                      className={inputCls + ' font-mono text-[12.5px]'}
                    />
                  </Field>
                </Card>

                <ClaudeCommandPreview
                  cliPath={values['claude.cli_path'] ?? 'claude'}
                  flagsJson={values['claude.flags'] ?? '["-p","--dangerously-skip-permissions"]'}
                />

                <Card
                  title="Orquestrador"
                  subtitle="Aplicado em tempo real — alterações valem na próxima execução, sem reiniciar."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Execuções simultâneas"
                      help="Quantos agentes podem rodar em paralelo. Acima disso, próximos entram em fila."
                    >
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={values['claude.max_concurrency'] ?? '3'}
                        onChange={(e) => set('claude.max_concurrency', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field
                      label="Tamanho máx. da fila"
                      help="Segurança contra acumulação infinita. Novas chamadas além disso falham."
                    >
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={values['claude.queue_max'] ?? '50'}
                        onChange={(e) => set('claude.queue_max', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </Card>

                <Card
                  title="Defaults para novos agentes"
                  subtitle="Valores que pré-preenchem o editor ao criar um agente novo. Agentes existentes mantêm seus próprios valores."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Modelo padrão">
                      <select
                        value={values['claude.default_model'] ?? 'sonnet'}
                        onChange={(e) => set('claude.default_model', e.target.value)}
                        className={inputCls}
                      >
                        <option>sonnet</option>
                        <option>opus</option>
                        <option>haiku</option>
                      </select>
                    </Field>
                    <Field label="Temperature">
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={1}
                        value={values['claude.temperature'] ?? '0.3'}
                        onChange={(e) => set('claude.temperature', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Max tokens">
                      <input
                        type="number"
                        value={values['claude.max_tokens'] ?? '12000'}
                        onChange={(e) => set('claude.max_tokens', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Timeout (s)">
                      <input
                        type="number"
                        value={values['claude.timeout_seconds'] ?? '300'}
                        onChange={(e) => set('claude.timeout_seconds', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Retries">
                      <input
                        type="number"
                        value={values['claude.retries'] ?? '2'}
                        onChange={(e) => set('claude.retries', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </Card>
              </>
            )}

            {tab === 'playwright' && (
              <>
                <Card
                  title="Navegador"
                  subtitle="Como o Chromium é aberto durante a raspagem do Workana. Vale na próxima raspagem (sem reiniciar)."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Modo" help="Headless roda invisível em segundo plano.">
                      <select
                        value={values['playwright.headless'] ?? 'true'}
                        onChange={(e) => set('playwright.headless', e.target.value)}
                        className={inputCls}
                      >
                        <option value="true">Headless (invisível)</option>
                        <option value="false">Janela visível</option>
                      </select>
                    </Field>
                    <Field
                      label="Canal do navegador"
                      help="Auto tenta o Chromium do Playwright e cai para Edge/Chrome do sistema."
                    >
                      <select
                        value={values['playwright.browser_channel'] ?? 'auto'}
                        onChange={(e) => set('playwright.browser_channel', e.target.value)}
                        className={inputCls}
                      >
                        <option value="auto">Auto (recomendado)</option>
                        <option value="chromium">Chromium (Playwright)</option>
                        <option value="msedge">Microsoft Edge</option>
                        <option value="chrome">Google Chrome</option>
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="Bloquear imagens/fontes/mídia"
                    help="Acelera a raspagem sem afetar a extração de texto."
                  >
                    <select
                      value={values['playwright.block_resources'] ?? 'false'}
                      onChange={(e) => set('playwright.block_resources', e.target.value)}
                      className={inputCls}
                    >
                      <option value="false">Não (carrega tudo)</option>
                      <option value="true">Sim (modo rápido)</option>
                    </select>
                  </Field>
                  <Field label="User-Agent" help="Identidade do navegador enviada ao Workana.">
                    <input
                      value={values['playwright.user_agent'] ?? DEFAULT_UA}
                      onChange={(e) => set('playwright.user_agent', e.target.value)}
                      className={inputCls + ' font-mono text-[12px]'}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Locale">
                      <input
                        value={values['playwright.locale'] ?? 'pt-BR'}
                        onChange={(e) => set('playwright.locale', e.target.value)}
                        className={inputCls}
                        placeholder="pt-BR"
                      />
                    </Field>
                    <Field label="Viewport largura">
                      <input
                        type="number"
                        value={values['playwright.viewport_width'] ?? '1366'}
                        onChange={(e) => set('playwright.viewport_width', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Viewport altura">
                      <input
                        type="number"
                        value={values['playwright.viewport_height'] ?? '900'}
                        onChange={(e) => set('playwright.viewport_height', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </Card>

                <Card
                  title="Tempos & limites"
                  subtitle="Timeouts (ms) e pausas anti-spam. A pausa entre vagas é o intervalo padrão usado pela tela Scrapper."
                >
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Timeout navegação (ms)" help="goto da página.">
                      <input
                        type="number"
                        value={values['playwright.nav_timeout_ms'] ?? '45000'}
                        onChange={(e) => set('playwright.nav_timeout_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Timeout seletor (ms)" help="Espera os cards/descrição.">
                      <input
                        type="number"
                        value={values['playwright.selector_timeout_ms'] ?? '15000'}
                        onChange={(e) => set('playwright.selector_timeout_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Timeout networkidle (ms)" help="0 desliga a espera.">
                      <input
                        type="number"
                        value={values['playwright.networkidle_timeout_ms'] ?? '8000'}
                        onChange={(e) => set('playwright.networkidle_timeout_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Pausa entre páginas (ms)" help="Entre páginas da listagem.">
                      <input
                        type="number"
                        value={values['playwright.page_pause_ms'] ?? '700'}
                        onChange={(e) => set('playwright.page_pause_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Máx. de páginas" help="Limite duro do campo da tela Scrapper.">
                      <input
                        type="number"
                        value={values['playwright.max_pages'] ?? '50'}
                        onChange={(e) => set('playwright.max_pages', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Pausa entre vagas — mín (ms)"
                      help="Tempo sorteado entre min e max a cada vaga (anti-spam)."
                    >
                      <input
                        type="number"
                        value={values['playwright.delay_min_ms'] ?? '2000'}
                        onChange={(e) => set('playwright.delay_min_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Pausa entre vagas — máx (ms)">
                      <input
                        type="number"
                        value={values['playwright.delay_max_ms'] ?? '5000'}
                        onChange={(e) => set('playwright.delay_max_ms', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </Card>

                <Card
                  title="System prompt"
                  subtitle="Instrução base do agente de raspagem. Guardada no banco para a normalização/análise das vagas raspadas."
                >
                  <Field label="Prompt">
                    <textarea
                      value={values['playwright.system_prompt'] ?? DEFAULT_PLAYWRIGHT_SYSTEM_PROMPT}
                      onChange={(e) => set('playwright.system_prompt', e.target.value)}
                      rows={6}
                      className={textareaCls}
                      placeholder="Instrução base do scraper…"
                    />
                  </Field>
                </Card>
              </>
            )}

            {tab === 'chaves' && (
              <Card title="Chaves de API">
                <Field label="Anthropic API Key">
                  <input type="password" value={values['keys.anthropic'] ?? ''} onChange={(e) => set('keys.anthropic', e.target.value)} className={inputCls} placeholder="sk-ant-..." />
                </Field>
                <Field label="OpenAI API Key">
                  <input type="password" value={values['keys.openai'] ?? ''} onChange={(e) => set('keys.openai', e.target.value)} className={inputCls} placeholder="sk-..." />
                </Field>
                <Field label="Gemini API Key">
                  <input type="password" value={values['keys.gemini'] ?? ''} onChange={(e) => set('keys.gemini', e.target.value)} className={inputCls} />
                </Field>
                <p className="text-[12.5px] text-secondary">
                  As chaves são armazenadas localmente no SQLite. Para produção, considere ativar criptografia em <code>settings.encrypted</code>.
                </p>
              </Card>
            )}


            {tab === 'match' && (
              <Card
                title="Match Engine"
                subtitle="Como o app calcula o % de match entre cada vaga e as tags monitoradas. As mudanças valem na próxima varredura (botão “Executar varredura agora”)."
              >
                <Field
                  label="Exibir vagas com match acima de (%)"
                  help="No dashboard, “Oportunidades recentes” lista apenas vagas com match estritamente acima deste valor."
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={values['match.min_score'] ?? '50'}
                    onChange={(e) => set('match.min_score', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Texto analisado"
                  help="Qual parte da vaga é comparada com as tags monitoradas."
                >
                  <select
                    value={values['match.scope'] ?? 'title_description'}
                    onChange={(e) => set('match.scope', e.target.value)}
                    className={inputCls}
                  >
                    <option value="title_description">Título + descrição</option>
                    <option value="description">Somente descrição</option>
                  </select>
                </Field>
                <Field
                  label="Correspondência"
                  help="Palavra inteira evita falsos positivos — ex.: a tag “API” não casa dentro de “rapidez”. Substring casa qualquer trecho."
                >
                  <select
                    value={values['match.whole_word'] ?? 'true'}
                    onChange={(e) => set('match.whole_word', e.target.value)}
                    className={inputCls}
                  >
                    <option value="true">Palavra inteira</option>
                    <option value="false">Substring (qualquer trecho)</option>
                  </select>
                </Field>
                <Field
                  label="Diferenciar maiúsculas/minúsculas"
                  help="Por padrão o match ignora a caixa (ex.: “react” = “React”)."
                >
                  <select
                    value={values['match.case_sensitive'] ?? 'false'}
                    onChange={(e) => set('match.case_sensitive', e.target.value)}
                    className={inputCls}
                  >
                    <option value="false">Ignorar caixa</option>
                    <option value="true">Diferenciar</option>
                  </select>
                </Field>
                <p className="text-[12.5px] text-secondary">
                  O <strong>peso</strong> de cada tag é configurado em <strong>Radar → Editar tags</strong>. O score é a soma dos pesos das tags presentes no texto, dividida pela soma dos pesos de todas as tags ativas.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-primary text-white px-4 py-3 rounded-xl shadow-cardHover flex items-center gap-3 z-50">
          <span className="text-[13.5px]">{toast}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function parseFlags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function ClaudeCommandPreview({ cliPath, flagsJson }: { cliPath: string; flagsJson: string }) {
  const flags = parseFlags(flagsJson);
  const cmd = cliPath?.trim() || 'claude';
  return (
    <Card
      title="Preview no terminal"
      subtitle="Como o comando será executado com a configuração atual — atualiza em tempo real."
    >
      <div className="rounded-xl overflow-hidden border border-[#1f2444] shadow-inner">
        {/* Barra superior estilo macOS */}
        <div className="px-3 py-2 bg-[#1a1f3a] flex items-center gap-1.5 border-b border-[#2a2f4f]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <span className="text-[11px] text-[#7a82ad] ml-2 font-mono">claude — execução automatizada</span>
        </div>
        {/* Corpo do terminal */}
        <div className="bg-[#0f1322] p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
          <div className="text-[#cdd5f5]">
            <span className="text-[#7ee787]">$</span>{' '}
            <span className="text-[#79c0ff]">echo</span>{' '}
            <span className="text-[#a5d6ff]">"Hello, world!"</span>{' '}
            <span className="text-[#ff7b72]">|</span>{' '}
            <span className="text-[#79c0ff]">{cmd}</span>
            {flags.map((f, i) => (
              <span key={`${f}-${i}`} className="text-[#ffa657]">
                {' '}
                {f}
              </span>
            ))}
          </div>
          <div className="text-[#7a82ad] mt-3">{'// Claude responde via stdout:'}</div>
          <div className="text-[#cdd5f5] mt-1">
            Olá! Estou pronto para ajudar. O que você quer construir hoje?
          </div>
          <div className="mt-3 flex items-center text-[#cdd5f5]">
            <span className="text-[#7ee787]">$</span>
            <span className="ml-2 w-2 h-[14px] bg-[#cdd5f5] animate-pulse" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <div className="mb-3">
        <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
        {subtitle && <p className="text-[12.5px] text-secondary mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">{label}</span>
      <div className="mt-1.5">{children}</div>
      {help && <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{help}</p>}
    </label>
  );
}

const inputCls = 'w-full h-[40px] px-3 rounded-xl border border-border bg-white text-[14px] outline-none focus:border-purple-ring flex-1 min-w-0';
const textareaCls = 'w-full px-3 py-2.5 rounded-xl border border-border bg-white text-[13.5px] leading-relaxed outline-none focus:border-purple-ring resize-y min-h-[120px]';
const browseCls = 'h-[40px] px-3 rounded-xl border border-border bg-white text-[12.5px] font-medium text-primary flex items-center gap-1.5 hover:bg-[#f8f8fb] shrink-0';
