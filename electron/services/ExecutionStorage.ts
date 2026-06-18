import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { readAppConfig } from './AppConfig';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

const FORMAT_EXTENSIONS: Record<string, string> = {
  markdown: 'md',
  structured_markdown: 'md',
  checklist: 'md',
  report: 'md',
  rich_text: 'md',
  json: 'json',
};

export function extensionForFormat(format: string | null | undefined): string {
  if (!format) return 'md';
  return FORMAT_EXTENSIONS[format] ?? 'md';
}

/**
 * Slug seguro pra nome de arquivo em todas as plataformas:
 * - Remove acentos.
 * - Substitui caracteres não-alfanuméricos por hífen.
 * - Trunca para 64 chars pra evitar paths absurdos no Windows.
 * Mantém um fallback se a entrada for vazia.
 */
export function slugForFilename(input: string | null | undefined, fallback = 'sem-nome'): string {
  if (!input) return fallback;
  const cleaned = input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

/**
 * Timestamp local no formato `YYYY-MM-DD_HH-mm-ss` — seguro pra Windows
 * (sem `:`), ordenável lexicograficamente.
 */
export function timestampForFilename(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    '-',
    pad(d.getMonth() + 1),
    '-',
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    '-',
    pad(d.getMinutes()),
    '-',
    pad(d.getSeconds()),
  ].join('');
}

/**
 * Resolve e cria (se faltar) uma subpasta dentro do workspace configurado.
 * Centraliza a validação do path pra todas as features que escrevem em disco
 * (executions, freelas, futuras).
 */
export function getWorkspaceSubdir(name: string): string {
  const cfg = readAppConfig();
  if (!cfg.workspacePath || !cfg.workspacePath.trim()) {
    throw new Error('Workspace não configurado (Settings → Pasta de workspace).');
  }
  if (!path.isAbsolute(cfg.workspacePath)) {
    throw new Error(
      `Workspace precisa ser um caminho absoluto. Configurado: "${cfg.workspacePath}"`,
    );
  }
  const dir = path.join(cfg.workspacePath, name);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new Error(`Não foi possível criar "${dir}": ${(err as Error).message}`);
  }
  return dir;
}

/**
 * Resolve o NOME da subpasta de saída a partir das settings (configurável em
 * Settings → Geral), caindo no default. Sanitiza pra um único segmento seguro
 * (sem separadores de path nem `..`).
 */
function resolveDirName(settingKey: string, fallback: string): string {
  try {
    const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, settingKey)).get();
    const raw = (row?.value ?? '').trim();
    const safe = raw.replace(/[\\/]+/g, '').replace(/\.{2,}/g, '').trim();
    return safe || fallback;
  } catch {
    return fallback;
  }
}

export function getExecutionsDir(): string {
  return getWorkspaceSubdir(resolveDirName('workspace.dir.executions', 'executions'));
}

export function getFreelasDir(): string {
  return getWorkspaceSubdir(resolveDirName('workspace.dir.freelas', 'freelas'));
}

export function getOportunidadesDir(): string {
  return getWorkspaceSubdir(resolveDirName('workspace.dir.oportunidades', 'oportunidades'));
}

/**
 * Grava o resultado de uma execução em disco.
 * Nome: {runId}_{slug_agente}_{slug_task}_{YYYY-MM-DD_HH-mm-ss}.{ext}
 *
 * `kind = 'output'` para sucesso (extensão derivada do output_format do agente).
 * `kind = 'error'`  para falha (extensão sempre `.log`, pra deixar claro).
 *
 * Devolve o caminho absoluto do arquivo gravado.
 */
export function writeExecutionOutput(params: {
  runId: number;
  agentName: string;
  task: string;
  format: string | null | undefined;
  content: string;
  when?: Date;
  kind?: 'output' | 'error';
}): string {
  const kind = params.kind ?? 'output';
  const ext = kind === 'error' ? 'log' : extensionForFormat(params.format);
  const slugAgent = slugForFilename(params.agentName, 'agente');
  const slugTask = slugForFilename(params.task, 'manual');
  const stamp = timestampForFilename(params.when ?? new Date());
  const suffix = kind === 'error' ? '_ERROR' : '';
  const filename = `${params.runId}_${slugAgent}_${slugTask}_${stamp}${suffix}.${ext}`;

  const dir = getExecutionsDir();
  const fullPath = path.join(dir, filename);
  try {
    fs.writeFileSync(fullPath, params.content, 'utf-8');
  } catch (err) {
    throw new Error(`Falha ao gravar "${fullPath}": ${(err as Error).message}`);
  }
  return fullPath;
}

/**
 * Exporta uma oportunidade pra `{workspace}/freelas/` como JSON formatado.
 * Nome: {id}_{slug_titulo}.json — **estável e idempotente**: regravar a mesma
 * oportunidade sobrescreve o mesmo arquivo, sem criar duplicatas. Esse é o
 * formato que no futuro vai virar a fonte de verdade (lidos por scraping).
 *
 * Tenta interpretar `detected_tags` (que é string JSON no DB) e devolver array
 * no payload final, pra ficar mais legível em consumers downstream.
 */
export function writeOpportunityAsJson(opp: {
  id: number;
  title: string | null | undefined;
  detected_tags?: string | null;
  [k: string]: unknown;
}): string {
  const dir = getFreelasDir();
  const slug = slugForFilename(opp.title, 'sem-titulo');
  const filename = `${opp.id}_${slug}.json`;
  const fullPath = path.join(dir, filename);

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(opp.detected_tags ?? '[]');
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    /* mantém [] */
  }
  const payload = { ...opp, detected_tags: tags };

  try {
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`Falha ao gravar "${fullPath}": ${(err as Error).message}`);
  }
  return fullPath;
}

/**
 * Grava uma oportunidade RASPADA (scraping externo) em `{workspace}/freelas/`.
 * Diferente de `writeOpportunityAsJson` (que parte de uma linha do banco e
 * espera `detected_tags` como string JSON), aqui o objeto já vem montado no
 * shape final de `Opportunity` — gravamos como veio, sem reinterpretar campos.
 *
 * Nome: `{id}_{slug_titulo}.json` — **idempotente**: re-raspar a mesma vaga
 * (mesmo `id`, derivado da URL) sobrescreve o mesmo arquivo, sem duplicar.
 * Devolve o caminho absoluto gravado.
 */
export function writeScrapedOpportunity(opp: {
  id: number;
  title: string | null | undefined;
  [k: string]: unknown;
}): string {
  const dir = getFreelasDir();
  const slug = slugForFilename(opp.title, 'sem-titulo');
  const filename = `${opp.id}_${slug}.json`;
  const fullPath = path.join(dir, filename);
  try {
    fs.writeFileSync(fullPath, JSON.stringify(opp, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`Falha ao gravar "${fullPath}": ${(err as Error).message}`);
  }
  return fullPath;
}

/**
 * Backfill: grava JSON pra cada oportunidade da lista. Idempotente (sobrescreve).
 * Devolve { written, errors }.
 */
export function backfillOpportunitiesJson(
  opportunities: Array<Parameters<typeof writeOpportunityAsJson>[0]>,
): { written: number; errors: string[] } {
  let written = 0;
  const errors: string[] = [];
  for (const opp of opportunities) {
    try {
      writeOpportunityAsJson(opp);
      written++;
    } catch (e) {
      errors.push(`#${opp.id}: ${(e as Error).message}`);
    }
  }
  return { written, errors };
}
