import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { ClaudeExecutionService, type ClaudeExecutionHandle } from './ClaudeExecutionService';
import { ActivityLogger } from './ActivityLogger';
import { writeExecutionOutput, extensionForFormat } from './ExecutionStorage';

export interface AgentRunEvent {
  runId: number;
  agentId: number;
  status: string;
  progress: number;
  current_step: string;
  next_step?: string;
  logChunk?: string;
  error?: string;
  outputFilePath?: string;
}

export class AgentRunner extends EventEmitter {
  readonly runId: number;
  readonly agentId: number;
  readonly opportunityId: number | null;
  private process: ClaudeExecutionHandle | null = null;
  private logs = '';
  private cancelled = false;

  constructor(runId: number, agentId: number, opportunityId: number | null) {
    super();
    this.runId = runId;
    this.agentId = agentId;
    this.opportunityId = opportunityId;
  }

  static async start(agentId: number, opportunityId: number | null = null) {
    const db = getDb();
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
    if (!agent) throw new Error(`Agent ${agentId} não encontrado`);

    const run = db.insert(schema.agent_runs).values({
      agent_id: agentId,
      opportunity_id: opportunityId ?? null,
      status: 'queued',
      progress: 0,
      current_step: 'Aguardando início',
      started_at: new Date(),
    }).returning().get();

    const runner = new AgentRunner(run.id, agentId, opportunityId);
    runner.execute().catch((err) => {
      console.error('[AgentRunner] execute failed', err);
    });
    return runner;
  }

  private async execute() {
    const db = getDb();
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, this.agentId)).get();
    if (!agent) return;

    const opp = this.opportunityId
      ? db.select().from(schema.opportunities).where(eq(schema.opportunities.id, this.opportunityId)).get()
      : null;

    const prompt = this.buildPrompt(agent, opp);

    const runtimeConfig = (() => {
      try { return JSON.parse(agent.runtime_config_json ?? '{}'); } catch { return {}; }
    })() as Record<string, unknown>;

    this.update({
      status: 'running',
      progress: 5,
      current_step: 'Inicializando agente',
    });

    ActivityLogger.log({
      type: 'agent_run',
      title: `${agent.name} iniciou execução`,
      description: opp?.title ?? 'Execução manual',
      metadata: { runId: this.runId, agentId: this.agentId },
    });

    this.process = ClaudeExecutionService.execute({
      prompt,
      model: agent.model ?? undefined,
      maxTokens: agent.max_tokens ?? undefined,
      timeoutSeconds: agent.timeout_seconds ?? 300,
      env: {
        FREELA_RADAR_AGENT: agent.slug,
        FREELA_RADAR_RUN_ID: String(this.runId),
      },
    });

    this.process.on('stdout', (chunk: string) => {
      this.logs += chunk;
      const heur = this.heuristicProgress(this.logs);
      this.update({
        status: 'running',
        progress: heur.progress,
        current_step: heur.step,
        next_step: heur.next,
        logChunk: chunk,
      });
    });

    this.process.on('stderr', (chunk: string) => {
      this.logs += `[stderr] ${chunk}`;
      this.update({ status: 'running', logChunk: `[stderr] ${chunk}` });
    });

    this.process.on('error', (err: Error) => {
      this.fail(err.message);
    });

    const result = await this.process.done;
    if (this.cancelled) return;

    if (result.code === 0) {
      this.complete(result.stdout);
    } else {
      this.fail(result.stderr || `Processo encerrou com código ${result.code}`);
    }
  }

  private buildPrompt(agent: schema.Agent, opp: schema.Opportunity | null | undefined): string {
    const parts: string[] = [];
    parts.push(`# IDENTIDADE\n${agent.soul_prompt ?? ''}`);
    parts.push(`# MISSÃO\n${agent.system_prompt ?? ''}`);
    if (agent.operational_prompt) parts.push(`# REGRAS OPERACIONAIS\n${agent.operational_prompt}`);

    if (opp) {
      const tags = (() => { try { return JSON.parse(opp.detected_tags ?? '[]') as string[]; } catch { return []; } })();
      parts.push(`# OPORTUNIDADE
- Título: ${opp.title}
- Descrição: ${opp.description ?? '(sem descrição)'}
- Orçamento: ${opp.budget_min ?? '?'} – ${opp.budget_max ?? '?'} ${opp.currency ?? 'BRL'}
- Tags: ${tags.join(', ')}
- URL: ${opp.source_url ?? ''}`);
    }

    parts.push(`# FORMATO DE SAÍDA
${agent.output_format ?? 'markdown'}`);

    parts.push(`# INSTRUÇÕES
Produza agora o artefato final, em português, pronto para envio ao cliente.
Use cabeçalhos markdown e numere passos quando útil.`);

    return parts.join('\n\n');
  }

  private heuristicProgress(buffer: string): { progress: number; step: string; next?: string } {
    // crude heuristic — looks for markdown headings and step markers
    const lines = buffer.split('\n').filter((l) => l.trim().length > 0);
    const headings = lines.filter((l) => /^#{1,3}\s+/.test(l));
    const lastHeading = headings.at(-1) ?? '';
    const nextHeading = headings.at(-2) ?? '';
    const progress = Math.min(95, 10 + Math.floor(lines.length * 1.5));
    return {
      progress,
      step: lastHeading.replace(/^#+\s+/, '').slice(0, 80) || 'Gerando conteúdo',
      next: nextHeading.replace(/^#+\s+/, '').slice(0, 80) || undefined,
    };
  }

  private update(patch: Partial<AgentRunEvent>) {
    const db = getDb();
    const dbPatch: Partial<schema.AgentRun> = {};
    if (patch.status) dbPatch.status = patch.status;
    if (typeof patch.progress === 'number') dbPatch.progress = patch.progress;
    if (patch.current_step) dbPatch.current_step = patch.current_step;
    if (patch.next_step !== undefined) dbPatch.next_step = patch.next_step ?? '';
    if (patch.logChunk) {
      const row = db.select().from(schema.agent_runs).where(eq(schema.agent_runs.id, this.runId)).get();
      const newLogs = (row?.logs ?? '') + patch.logChunk;
      dbPatch.logs = newLogs.length > 200_000 ? newLogs.slice(-200_000) : newLogs;
    }
    db.update(schema.agent_runs).set(dbPatch).where(eq(schema.agent_runs.id, this.runId)).run();
    this.emit('event', { runId: this.runId, agentId: this.agentId, ...patch });
  }

  private complete(output: string) {
    const db = getDb();
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, this.agentId)).get();
    const opp = this.opportunityId
      ? db.select().from(schema.opportunities).where(eq(schema.opportunities.id, this.opportunityId)).get()
      : null;

    // Grava o output em arquivo dentro de {workspace}/executions/
    let filePath: string | undefined;
    let writeError: string | undefined;
    try {
      filePath = writeExecutionOutput({
        runId: this.runId,
        agentName: agent?.name ?? `agente-${this.agentId}`,
        task: opp?.title ?? 'manual',
        format: agent?.output_format,
        content: output,
      });
      console.log(`[AgentRunner] run #${this.runId} → arquivo gravado em ${filePath}`);
    } catch (err) {
      writeError = (err as Error).message;
      console.error('[AgentRunner] falha ao gravar arquivo de saída:', writeError);
    }

    db.update(schema.agent_runs).set({
      status: writeError ? 'failed' : 'completed',
      progress: 100,
      completed_at: new Date(),
      current_step: writeError ? 'Concluído (falha ao gravar arquivo)' : 'Concluído',
      error: writeError ?? null,
    }).where(eq(schema.agent_runs.id, this.runId)).run();

    db.insert(schema.agent_artifacts).values({
      agent_run_id: this.runId,
      type: extensionForFormat(agent?.output_format),
      title: 'Artefato gerado',
      content: output,
      metadata_json: JSON.stringify({ runId: this.runId, filePath, writeError }),
      created_at: new Date(),
    }).run();

    ActivityLogger.log({
      type: writeError ? 'error' : 'document',
      title: writeError
        ? `${agent?.name ?? 'Agente'}: falha ao gravar arquivo`
        : `${agent?.name ?? 'Agente'} gerou documento`,
      description: writeError ?? (filePath ? `Salvo em: ${filePath}` : 'Artefato salvo'),
      metadata: { runId: this.runId, filePath, writeError },
    });

    this.emit('event', {
      runId: this.runId,
      agentId: this.agentId,
      status: writeError ? 'failed' : 'completed',
      progress: 100,
      current_step: writeError ? 'Concluído (falha ao gravar arquivo)' : 'Concluído',
      error: writeError,
      outputFilePath: filePath,
    });
  }

  private fail(message: string) {
    const db = getDb();
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, this.agentId)).get();
    const opp = this.opportunityId
      ? db.select().from(schema.opportunities).where(eq(schema.opportunities.id, this.opportunityId)).get()
      : null;

    // Mesmo em falha, grava um log no executions/ pra inspeção:
    // contém a mensagem de erro + stderr/stdout acumulados.
    const errorReport = [
      `# Execução falhou — run #${this.runId}`,
      `Agente: ${agent?.name ?? this.agentId}`,
      `Data: ${new Date().toISOString()}`,
      ``,
      `## Erro`,
      message,
      ``,
      `## Logs capturados`,
      this.logs || '(sem saída)',
    ].join('\n');

    let filePath: string | undefined;
    try {
      filePath = writeExecutionOutput({
        runId: this.runId,
        agentName: agent?.name ?? `agente-${this.agentId}`,
        task: opp?.title ?? 'manual',
        format: agent?.output_format,
        content: errorReport,
        kind: 'error',
      });
      console.log(`[AgentRunner] run #${this.runId} (falha) → log gravado em ${filePath}`);
    } catch (err) {
      console.error('[AgentRunner] falha ao gravar log de erro:', err);
    }

    db.update(schema.agent_runs).set({
      status: 'failed',
      error: message,
      completed_at: new Date(),
    }).where(eq(schema.agent_runs.id, this.runId)).run();

    ActivityLogger.log({
      type: 'error',
      title: 'Falha em execução de agente',
      description: filePath ? `${message.slice(0, 150)} (log: ${filePath})` : message.slice(0, 200),
      metadata: { runId: this.runId, filePath },
    });

    this.emit('event', {
      runId: this.runId,
      agentId: this.agentId,
      status: 'failed',
      progress: 0,
      current_step: 'Erro',
      error: message,
      outputFilePath: filePath,
    });
  }

  cancel() {
    this.cancelled = true;
    if (this.process) this.process.kill();
    const db = getDb();
    db.update(schema.agent_runs).set({
      status: 'cancelled',
      completed_at: new Date(),
    }).where(eq(schema.agent_runs.id, this.runId)).run();
    this.emit('event', {
      runId: this.runId,
      agentId: this.agentId,
      status: 'cancelled',
      progress: 0,
      current_step: 'Cancelado',
    });
  }
}
