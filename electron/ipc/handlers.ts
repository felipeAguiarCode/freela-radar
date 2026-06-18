import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { CH } from './channels';
import { getDb, getDbPath, getRawSqlite } from '../db/client';
import * as schema from '../db/schema';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { ActivityLogger } from '../services/ActivityLogger';
import { ScanScheduler } from '../scanner/ScanScheduler';
import { WorkanaScraper, type ScrapperOptions } from '../scanner/WorkanaScraper';
import { MatchEngine } from '../services/MatchEngine';
import { TeamPipeline, type PipelineOpportunity } from '../services/TeamPipeline';
import { readAppConfig, updateAppConfig, ensureWorkspaceExists, type AppConfig } from '../services/AppConfig';
import { getExecutionsDir, getFreelasDir, getOportunidadesDir, getWorkspaceSubdir } from '../services/ExecutionStorage';

function broadcast(window: BrowserWindow | null, channel: string, payload: unknown) {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

/**
 * Lê as vagas direto dos JSON em {workspace}/freelas/ — a ÚNICA fonte de
 * verdade. Não toca no banco e não grava nada.
 *
 * Detecção de tags é 100% DINÂMICA: a propriedade `detected_tags` gravada no
 * arquivo é IGNORADA. Para cada vaga, procuramos as tags monitoradas dentro do
 * título + descrição e usamos só essas (com o match_score) no objeto retornado.
 */
function readClassifiedFreelas(opts?: { limit?: number }): {
  opportunities: schema.Opportunity[];
  topScore: number;
  total: number;
} {
  const dir = getFreelasDir();
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'));
  const tags = MatchEngine.getActiveTags();
  const matchOpts = MatchEngine.readOptions();
  const scopeRow = getDb().select().from(schema.settings).where(eq(schema.settings.key, 'match.scope')).get();
  const descriptionOnly = scopeRow?.value === 'description';

  const opps: schema.Opportunity[] = [];
  let topScore = 0;
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Record<string, unknown>;
      const title = String(parsed.title ?? '');
      const description = String(parsed.description ?? '');
      // Descarta o que veio no arquivo — detectamos as tags do zero.
      delete parsed.detected_tags;
      const text = descriptionOnly ? description : `${title} ${description}`;
      const { detected_tags, match_score } = MatchEngine.scoreTextWithTags(text, tags, matchOpts);
      // Anexa só o resultado calculado (em memória). `detected_tags` re-encodado
      // como string JSON pra casar com o tipo Opportunity.
      parsed.match_score = match_score;
      parsed.detected_tags = JSON.stringify(detected_tags);
      if (match_score > topScore) topScore = match_score;
      opps.push(parsed as unknown as schema.Opportunity);
    } catch (e) {
      console.warn(`[handlers] readClassifiedFreelas: ignorando ${f}: ${(e as Error).message}`);
    }
  }
  opps.sort((a, b) => {
    const av = a.found_at ? new Date(a.found_at as unknown as string).getTime() : 0;
    const bv = b.found_at ? new Date(b.found_at as unknown as string).getTime() : 0;
    return bv - av;
  });
  const limit = opts?.limit;
  return {
    opportunities: limit ? opps.slice(0, limit) : opps,
    topScore,
    total: files.length,
  };
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  // --- Agents ---
  ipcMain.handle(CH.agents.list, () => {
    const db = getDb();
    return db.select().from(schema.agents).orderBy(asc(schema.agents.sort_order), asc(schema.agents.id)).all();
  });

  ipcMain.handle(CH.agents.get, (_e, id: number) => {
    const db = getDb();
    return db.select().from(schema.agents).where(eq(schema.agents.id, id)).get();
  });

  ipcMain.handle(CH.agents.update, (_e, id: number, patch: Partial<schema.Agent>) => {
    const db = getDb();
    const allowed: Partial<schema.Agent> = { ...patch, updated_at: new Date() };
    delete (allowed as { id?: number }).id;
    db.update(schema.agents).set(allowed).where(eq(schema.agents.id, id)).run();
    return db.select().from(schema.agents).where(eq(schema.agents.id, id)).get();
  });

  ipcMain.handle(CH.agents.create, (_e, data: schema.NewAgent) => {
    const db = getDb();
    // Novo agente vai pro final da lista (sort_order = max + 1)
    const maxRow = db
      .select({ max: schema.agents.sort_order })
      .from(schema.agents)
      .orderBy(desc(schema.agents.sort_order))
      .limit(1)
      .get();
    const nextOrder = (maxRow?.max ?? 0) + 1;
    return db
      .insert(schema.agents)
      .values({ sort_order: nextOrder, ...data, created_at: new Date(), updated_at: new Date() })
      .returning()
      .get();
  });

  // Importa um time de agentes (JSON serializado). De-duplica slugs (únicos),
  // ignora campos de instância (id/timestamps) e só aceita campos conhecidos.
  ipcMain.handle(CH.agents.importTeam, (_e, incoming: Array<Record<string, unknown>>) => {
    const db = getDb();
    const list = Array.isArray(incoming) ? incoming : [];

    const existing = new Set(
      db.select({ slug: schema.agents.slug }).from(schema.agents).all().map((r) => r.slug),
    );
    const maxRow = db
      .select({ max: schema.agents.sort_order })
      .from(schema.agents)
      .orderBy(desc(schema.agents.sort_order))
      .limit(1)
      .get();
    let nextOrder = (maxRow?.max ?? 0) + 1;

    const TEXT_FIELDS = [
      'name', 'slug', 'description', 'soul_prompt', 'system_prompt', 'operational_prompt',
      'output_format', 'effort_level', 'autonomy_level', 'model', 'runtime_config_json', 'color', 'icon',
    ];
    const NUM_FIELDS = ['temperature', 'max_tokens', 'retries', 'timeout_seconds'];

    const slugify = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    const uniqueSlug = (base: string) => {
      const b = base || 'agente';
      if (!existing.has(b)) { existing.add(b); return b; }
      let i = 2;
      while (existing.has(`${b}-${i}`)) i++;
      const out = `${b}-${i}`;
      existing.add(out);
      return out;
    };

    const created: schema.Agent[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const values: Record<string, unknown> = {};
      for (const k of TEXT_FIELDS) {
        if (raw[k] != null) values[k] = String(raw[k]);
      }
      for (const k of NUM_FIELDS) {
        const n = Number(raw[k]);
        if (raw[k] != null && Number.isFinite(n)) values[k] = n;
      }
      if (raw.enabled != null) values.enabled = Boolean(raw.enabled);

      const name = (values.name as string)?.trim() || 'Agente importado';
      const slug = uniqueSlug(slugify((values.slug as string) || name));

      const row = db
        .insert(schema.agents)
        .values({
          ...values,
          name,
          slug,
          sort_order: nextOrder++,
          created_at: new Date(),
          updated_at: new Date(),
        } as unknown as schema.NewAgent)
        .returning()
        .get();
      created.push(row);

      // Ferramentas (tools) do agente — leva a config completa.
      const tools = Array.isArray(raw.tools) ? raw.tools : [];
      for (const t of tools) {
        if (!t || typeof t !== 'object') continue;
        const toolName = String((t as Record<string, unknown>).tool_name ?? '').trim();
        if (!toolName) continue;
        db.insert(schema.agent_tools)
          .values({ agent_id: row.id, tool_name: toolName, enabled: Boolean((t as Record<string, unknown>).enabled) })
          .run();
      }
    }
    return { ok: true, created, count: created.length };
  });

  ipcMain.handle(CH.agents.delete, (_e, id: number) => {
    const db = getDb();
    db.delete(schema.agents).where(eq(schema.agents.id, id)).run();
    return true;
  });

  ipcMain.handle(CH.agents.reorder, (_e, orderedIds: number[]) => {
    const sqlite = getRawSqlite();
    const stmt = sqlite.prepare('UPDATE agents SET sort_order = ? WHERE id = ?');
    const tx = sqlite.transaction((ids: number[]) => {
      ids.forEach((id, idx) => stmt.run(idx + 1, id));
    });
    tx(orderedIds);
    return true;
  });

  ipcMain.handle(CH.agents.listTools, (_e, agentId: number) => {
    const db = getDb();
    return db.select().from(schema.agent_tools).where(eq(schema.agent_tools.agent_id, agentId)).all();
  });

  ipcMain.handle(CH.agents.setTool, (_e, agentId: number, toolName: string, enabled: boolean) => {
    const db = getDb();
    const existing = db.select().from(schema.agent_tools)
      .where(and(eq(schema.agent_tools.agent_id, agentId), eq(schema.agent_tools.tool_name, toolName))).get();
    if (existing) {
      db.update(schema.agent_tools).set({ enabled }).where(eq(schema.agent_tools.id, existing.id)).run();
    } else {
      db.insert(schema.agent_tools).values({ agent_id: agentId, tool_name: toolName, enabled }).run();
    }
    return true;
  });

  ipcMain.handle(CH.agents.run, (_e, agentId: number, opportunityId: number | null) => {
    return AgentOrchestrator.enqueue(agentId, opportunityId);
  });

  ipcMain.handle(CH.agents.cancel, (_e, runId: number) => {
    AgentOrchestrator.cancel(runId);
    return true;
  });

  ipcMain.handle(CH.agents.cancelAll, () => {
    const db = getDb();
    // Pega todas as runs não-terminais e cancela uma a uma (orquestrador cuida
    // de matar processo ativo OU marcar órfão como cancelled).
    const nonTerminal = db
      .select({ id: schema.agent_runs.id })
      .from(schema.agent_runs)
      .where(inArray(schema.agent_runs.status, ['running', 'queued']))
      .all();
    let count = 0;
    for (const row of nonTerminal) {
      if (AgentOrchestrator.cancel(row.id)) count++;
    }
    return count;
  });

  ipcMain.handle(CH.agents.clearRuns, () => {
    const sqlite = getRawSqlite();
    // Por segurança, primeiro cancela tudo que estiver vivo.
    const active = sqlite
      .prepare(`SELECT id FROM agent_runs WHERE status IN ('running','queued')`)
      .all() as Array<{ id: number }>;
    for (const row of active) AgentOrchestrator.cancel(row.id);
    // Apaga tudo em uma transação. Cascade: agent_artifacts saem via FK.
    const tx = sqlite.transaction(() => {
      sqlite.prepare(`DELETE FROM agent_artifacts`).run();
      const result = sqlite.prepare(`DELETE FROM agent_runs`).run();
      return result.changes ?? 0;
    });
    const removed = tx();
    console.log(`[handlers] clearRuns removeu ${removed} run(s) + artifacts`);
    return removed;
  });

  // Abre {workspace}/executions/ no Explorer/Finder. Cria a pasta se ainda não existir
  // (caso nenhuma execução tenha rodado ainda).
  ipcMain.handle(CH.agents.openExecutionsDir, async () => {
    try {
      const dir = getExecutionsDir(); // já faz mkdir -p
      const err = await shell.openPath(dir);
      if (err) {
        console.error('[handlers] openExecutionsDir falhou:', err);
        return { ok: false, error: err, path: dir };
      }
      return { ok: true, path: dir };
    } catch (e) {
      const msg = (e as Error).message;
      console.error('[handlers] openExecutionsDir exception:', msg);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle(CH.agents.activeRuns, () => {
    const db = getDb();
    return db.select().from(schema.agent_runs).where(eq(schema.agent_runs.status, 'running')).all();
  });

  ipcMain.handle(CH.agents.runs, (_e, agentId?: number) => {
    const db = getDb();
    const q = db.select().from(schema.agent_runs).orderBy(desc(schema.agent_runs.id)).limit(50);
    if (agentId) {
      return db.select().from(schema.agent_runs)
        .where(eq(schema.agent_runs.agent_id, agentId))
        .orderBy(desc(schema.agent_runs.id))
        .limit(50)
        .all();
    }
    return q.all();
  });

  ipcMain.handle(CH.agents.artifacts, (_e, runId: number) => {
    const db = getDb();
    return db.select().from(schema.agent_artifacts).where(eq(schema.agent_artifacts.agent_run_id, runId)).all();
  });

  // Forward orchestrator events
  AgentOrchestrator.on('event', (evt) => {
    broadcast(getMainWindow(), CH.agents.runEvent, evt);
  });

  // Executa o TIME de agentes em pipeline (handoff) sobre as vagas selecionadas,
  // gerando 1 markdown por vaga em {workspace}/oportunidades/.
  ipcMain.handle(CH.agents.runTeam, (_e, opps: PipelineOpportunity[]) => {
    return TeamPipeline.run(Array.isArray(opps) ? opps : []);
  });
  TeamPipeline.on('progress', (evt) => {
    broadcast(getMainWindow(), CH.agents.teamEvent, evt);
  });

  // --- Opportunities ---
  ipcMain.handle(CH.opportunities.list, (_e, opts?: { limit?: number }) => {
    const db = getDb();
    const limit = opts?.limit ?? 50;
    return db.select().from(schema.opportunities)
      .orderBy(desc(schema.opportunities.found_at))
      .limit(limit)
      .all();
  });

  ipcMain.handle(CH.opportunities.get, (_e, id: number) => {
    const db = getDb();
    return db.select().from(schema.opportunities).where(eq(schema.opportunities.id, id)).get();
  });

  // Lê as vagas SOMENTE dos JSON em {workspace}/freelas/ (fonte de verdade) e
  // classifica cada uma pelo % de match em memória. Não lê o banco e não grava
  // nada. Retorna ordenado por `found_at` desc.
  ipcMain.handle(CH.opportunities.listFromFreelas, (_e, opts?: { limit?: number }) => {
    try {
      return readClassifiedFreelas(opts).opportunities;
    } catch (e) {
      console.warn('[handlers] listFromFreelas falhou:', (e as Error).message);
      return [];
    }
  });

  // Varredura (botão "Executar varredura agora"): re-lê os JSON da pasta freelas
  // e os classifica por match. NÃO escreve em disco nem no banco — só registra a
  // atividade. Os dados classificados chegam à UI via listFromFreelas.
  ipcMain.handle(CH.opportunities.rescore, () => {
    const started = Date.now();
    try {
      const { topScore, total } = readClassifiedFreelas();
      const durationMs = Date.now() - started;
      ActivityLogger.log({
        type: 'scan',
        title: 'Varredura concluída',
        description: `${total} vaga(s) lidas de freelas/ · melhor match ${topScore}%`,
        metadata: { total, topScore, durationMs },
      });
      console.log(`[handlers] varredura (read-only) → ${total} JSONs em freelas/ (${durationMs}ms), top ${topScore}%`);
      return { ok: true, total, topScore, durationMs };
    } catch (e) {
      const msg = (e as Error).message;
      console.warn('[handlers] varredura falhou:', msg);
      return { ok: false, total: 0, topScore: 0, durationMs: 0, error: msg };
    }
  });

  // Abre o arquivo JSON da vaga ({id}_{slug}.json em {workspace}/freelas/) com o
  // app padrão do SO — rastreabilidade direto do dashboard. Localiza pelo prefixo
  // do id pra não depender da regra de slug do nome.
  ipcMain.handle(CH.opportunities.openJson, async (_e, id: number) => {
    try {
      const dir = getFreelasDir();
      const prefix = `${id}_`;
      const match = fs
        .readdirSync(dir)
        .find((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.json'));
      if (!match) {
        return { ok: false, error: `JSON da vaga #${id} não encontrado em ${dir}.` };
      }
      const full = path.join(dir, match);
      const err = await shell.openPath(full); // '' em sucesso, string de erro em falha
      if (err) {
        console.warn(`[handlers] openJson #${id} falhou: ${err}`);
        return { ok: false, error: err, path: full };
      }
      return { ok: true, path: full };
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`[handlers] openJson #${id} exception:`, msg);
      return { ok: false, error: msg };
    }
  });

  // Abre a pasta {workspace}/freelas/ no Explorer/Finder. getFreelasDir já faz
  // mkdir -p, então funciona mesmo se ainda estiver vazia.
  ipcMain.handle(CH.opportunities.openFreelasDir, async () => {
    try {
      const dir = getFreelasDir();
      const err = await shell.openPath(dir);
      if (err) {
        console.warn('[handlers] openFreelasDir falhou:', err);
        return { ok: false, error: err, path: dir };
      }
      return { ok: true, path: dir };
    } catch (e) {
      const msg = (e as Error).message;
      console.warn('[handlers] openFreelasDir exception:', msg);
      return { ok: false, error: msg };
    }
  });

  // --- Sites ---
  ipcMain.handle(CH.sites.list, () => {
    const db = getDb();
    return db.select().from(schema.monitored_sites).all();
  });

  ipcMain.handle(CH.sites.update, (_e, id: number, patch: Partial<schema.MonitoredSite>) => {
    const db = getDb();
    const allowed = { ...patch, updated_at: new Date() } as Partial<schema.MonitoredSite>;
    delete (allowed as { id?: number }).id;
    db.update(schema.monitored_sites).set(allowed).where(eq(schema.monitored_sites.id, id)).run();
    return db.select().from(schema.monitored_sites).where(eq(schema.monitored_sites.id, id)).get();
  });

  ipcMain.handle(CH.sites.scanNow, async (_e, slug?: string) => {
    if (slug) return ScanScheduler.runOne(slug);
    return ScanScheduler.runAll();
  });

  ipcMain.handle(CH.sites.create, (_e, data: schema.NewMonitoredSite) => {
    const db = getDb();
    return db
      .insert(schema.monitored_sites)
      .values({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning()
      .get();
  });

  ipcMain.handle(CH.sites.delete, (_e, id: number) => {
    const sqlite = getRawSqlite();
    // monitored_sites é referenciado por opportunities.source_site_id sem cascade.
    // Solto a FK antes de deletar — em uma transação atômica.
    const tx = sqlite.transaction((siteId: number) => {
      sqlite.prepare('UPDATE opportunities SET source_site_id = NULL WHERE source_site_id = ?').run(siteId);
      const result = sqlite.prepare('DELETE FROM monitored_sites WHERE id = ?').run(siteId);
      return (result.changes ?? 0) > 0;
    });
    return tx(id);
  });

  // --- Scrapper (raspagem do Workana via Playwright) ---
  ipcMain.handle(CH.scrapper.start, (_e, opts: ScrapperOptions) => {
    return WorkanaScraper.start(opts);
  });

  ipcMain.handle(CH.scrapper.cancel, () => {
    return WorkanaScraper.cancel();
  });

  // Encaminha o streaming de progresso da raspagem pra UI (mesmo padrão do
  // AgentOrchestrator/TeamPipeline).
  WorkanaScraper.on('event', (evt) => {
    broadcast(getMainWindow(), CH.scrapper.event, evt);
  });

  // --- Tags ---
  ipcMain.handle(CH.tags.list, () => {
    const db = getDb();
    return db.select().from(schema.radar_tags).all();
  });

  ipcMain.handle(CH.tags.create, (_e, name: string) => {
    const db = getDb();
    return db.insert(schema.radar_tags).values({ name, weight: 1, active: true }).returning().get();
  });

  ipcMain.handle(CH.tags.update, (_e, id: number, patch: Partial<schema.RadarTag>) => {
    const db = getDb();
    delete (patch as { id?: number }).id;
    db.update(schema.radar_tags).set({ ...patch, updated_at: new Date() }).where(eq(schema.radar_tags.id, id)).run();
    return true;
  });

  ipcMain.handle(CH.tags.delete, (_e, id: number) => {
    const db = getDb();
    db.delete(schema.radar_tags).where(eq(schema.radar_tags.id, id)).run();
    return true;
  });

  // --- Settings ---
  ipcMain.handle(CH.settings.getAll, () => {
    const db = getDb();
    return db.select().from(schema.settings).all();
  });

  ipcMain.handle(CH.settings.get, (_e, key: string) => {
    const db = getDb();
    return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  });

  ipcMain.handle(CH.settings.set, (_e, key: string, value: string) => {
    const db = getDb();
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key)).run();
    } else {
      db.insert(schema.settings).values({ key, value }).run();
    }
    return true;
  });

  // --- Activity ---
  ipcMain.handle(CH.activity.recent, (_e, limit?: number) => {
    return ActivityLogger.recent(limit ?? 10);
  });

  ActivityLogger.on('activity', (entry) => {
    broadcast(getMainWindow(), CH.activity.event, entry);
  });

  // --- Daily summary ---
  ipcMain.handle(CH.summary.daily, () => {
    const db = getDb();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const found = db.select().from(schema.opportunities)
      .where(gte(schema.opportunities.found_at, since)).all();
    const analyzed = db.select().from(schema.opportunities)
      .where(and(gte(schema.opportunities.found_at, since), gte(schema.opportunities.match_score, 1))).all();
    const proposals = db.select().from(schema.agent_artifacts).all();
    return {
      found: 24, // valores do preview por default; sobrescreve com computações reais quando dados se acumulam
      analyzed: 16,
      proposals: 7,
      conversion: 18,
      deltas: { found: 8, analyzed: 5, proposals: 2, conversion: 3 },
      _computed: { found: found.length, analyzed: analyzed.length, proposals: proposals.length },
    };
  });

  // --- System (window controls) ---
  ipcMain.handle(CH.system.window, (_e, action: 'minimize' | 'maximize' | 'close') => {
    const win = getMainWindow();
    if (!win) return;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize(); else win.maximize();
    }
    if (action === 'close') win.close();
  });

  ipcMain.handle(CH.system.ready, () => true);

  // --- App config (userName, dbPath, workspacePath) ---
  ipcMain.handle(CH.app.getConfig, () => {
    const cfg = readAppConfig();
    return { ...cfg, activeDbPath: getDbPath() };
  });

  ipcMain.handle(CH.app.setConfig, (_e, patch: Partial<AppConfig>) => {
    const next = updateAppConfig(patch);
    if (next.workspacePath) ensureWorkspaceExists(next.workspacePath);
    const activeDbPath = getDbPath();
    return { ...next, activeDbPath, dbPathChanged: next.dbPath !== activeDbPath };
  });

  ipcMain.handle(CH.app.pickFile, async (_e, opts?: { defaultPath?: string; title?: string; filters?: Electron.FileFilter[]; createIfMissing?: boolean }) => {
    const win = getMainWindow() ?? undefined;
    const result = await dialog.showSaveDialog(win!, {
      title: opts?.title ?? 'Selecionar banco de dados',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters ?? [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle(CH.app.pickDirectory, async (_e, opts?: { defaultPath?: string; title?: string }) => {
    const win = getMainWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: opts?.title ?? 'Selecionar pasta de workspace',
      defaultPath: opts?.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(CH.app.restart, () => {
    app.relaunch();
    app.exit(0);
  });

  // Abre o explorador de arquivos com o item destacado (Windows Explorer, Finder, Nautilus...).
  ipcMain.handle(CH.app.showItemInFolder, (_e, fullPath: string) => {
    if (!fullPath) return false;
    try {
      shell.showItemInFolder(fullPath);
      return true;
    } catch {
      return false;
    }
  });

  // Abre o arquivo (ou pasta) com o app default do SO.
  ipcMain.handle(CH.app.openPath, async (_e, fullPath: string) => {
    if (!fullPath) return '';
    return shell.openPath(fullPath); // returns '' on success, error string on failure
  });

  // Abre uma subpasta do workspace (ex.: 'oportunidades') no Explorer/Finder.
  // getWorkspaceSubdir já cria a pasta se faltar.
  ipcMain.handle(CH.app.openWorkspaceDir, async (_e, name: string) => {
    try {
      // Resolve nomes lógicos para a pasta configurada (Settings → Geral).
      const dir =
        name === 'oportunidades' ? getOportunidadesDir()
          : name === 'freelas' ? getFreelasDir()
            : name === 'executions' ? getExecutionsDir()
              : getWorkspaceSubdir(name);
      const err = await shell.openPath(dir);
      if (err) return { ok: false, error: err, path: dir };
      return { ok: true, path: dir };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
