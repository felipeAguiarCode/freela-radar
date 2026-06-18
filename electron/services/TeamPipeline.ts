import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { ClaudeExecutionService } from './ClaudeExecutionService';
import { getOportunidadesDir, slugForFilename, timestampForFilename } from './ExecutionStorage';
import { ActivityLogger } from './ActivityLogger';

/** Dados mínimos de uma vaga vindos dos JSON em freelas/. */
export interface PipelineOpportunity {
  id: number;
  title: string;
  description?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  detected_tags?: string | string[] | null;
  source_url?: string | null;
}

export interface TeamProgressEvent {
  type: 'opp-start' | 'agent-start' | 'agent-done' | 'opp-done' | 'done' | 'error';
  oppIndex?: number;
  oppTotal?: number;
  oppTitle?: string;
  agentIndex?: number;
  agentTotal?: number;
  agentName?: string;
  /** Seed do avatar do agente (icon ou slug) — pra UI exibir o BotAvatar. */
  agentIcon?: string;
  filePath?: string;
  error?: string;
}

export interface TeamRunResult {
  ok: boolean;
  written: string[];
  errors: string[];
  dir: string;
}

function parseTags(detected: PipelineOpportunity['detected_tags']): string[] {
  if (Array.isArray(detected)) return detected.map(String);
  if (typeof detected === 'string') {
    try {
      const parsed = JSON.parse(detected);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function budgetLine(opp: PipelineOpportunity): string {
  const cur = opp.currency ?? 'BRL';
  if (opp.budget_min == null && opp.budget_max == null) return 'não informado';
  return `${opp.budget_min ?? '?'} – ${opp.budget_max ?? '?'} ${cur}`;
}

/**
 * Monta o prompt de um agente dentro do pipeline. Inclui a vaga (título +
 * descrição) e, a partir do 2º agente, o trabalho do agente anterior (handoff).
 */
function buildPrompt(
  agent: schema.Agent,
  opp: PipelineOpportunity,
  handoff: string,
  index: number,
  total: number,
): string {
  const parts: string[] = [];
  parts.push(`# IDENTIDADE\n${agent.soul_prompt ?? ''}`);
  parts.push(`# MISSÃO\n${agent.system_prompt ?? ''}`);
  if (agent.operational_prompt) parts.push(`# REGRAS OPERACIONAIS\n${agent.operational_prompt}`);

  const tags = parseTags(opp.detected_tags);
  parts.push(
    `# OPORTUNIDADE\n- Título: ${opp.title}\n- Descrição: ${opp.description ?? '(sem descrição)'}\n- Orçamento: ${budgetLine(opp)}${tags.length ? `\n- Tags: ${tags.join(', ')}` : ''}`,
  );

  if (index > 0 && handoff.trim()) {
    parts.push(
      `# TRABALHO DO AGENTE ANTERIOR (HANDOFF)\nEste é o resultado produzido pelo agente anterior do time. Use-o como base e avance a partir daqui:\n\n${handoff}`,
    );
  }

  parts.push(`# FORMATO DE SAÍDA\n${agent.output_format ?? 'markdown'}`);

  const isLast = index === total - 1;
  parts.push(
    `# INSTRUÇÕES\nProduza agora a sua parte do trabalho, em português e em markdown. ` +
      (isLast
        ? 'Você é o ÚLTIMO agente do time: entregue o resultado final consolidado, pronto para uso.'
        : 'Seu resultado será entregue ao próximo agente do time (handoff), então finalize sua etapa de forma clara.'),
  );

  return parts.join('\n\n');
}

/** Monta o markdown único consolidando a execução do time para uma vaga. */
function buildMarkdown(
  opp: PipelineOpportunity,
  agents: schema.Agent[],
  sections: Array<{ agent: string; output: string; ok: boolean }>,
  when: Date,
): string {
  const tags = parseTags(opp.detected_tags);
  const lines: string[] = [];
  lines.push(`# ${opp.title}`, '');
  if (opp.description) lines.push(opp.description, '');
  lines.push('---', '');
  lines.push(`- **Pipeline:** ${agents.map((a) => a.name).join(' → ')}`);
  lines.push(`- **Orçamento:** ${budgetLine(opp)}`);
  if (tags.length) lines.push(`- **Tags:** ${tags.join(', ')}`);
  if (opp.source_url) lines.push(`- **Origem:** ${opp.source_url}`);
  lines.push(`- **Gerado em:** ${when.toLocaleString('pt-BR')}`);
  lines.push('', '---', '');
  for (const s of sections) {
    lines.push(`## ${s.agent}${s.ok ? '' : ' ⚠️'}`, '', s.output, '');
  }
  return lines.join('\n');
}

class TeamPipelineImpl extends EventEmitter {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Para cada vaga selecionada, roda TODOS os agentes ativos em sequência,
   * fazendo handoff do output de um pro próximo, e grava um markdown único em
   * {workspace}/oportunidades/. Não toca na pasta freelas/ nem nas vagas no DB.
   */
  async run(opps: PipelineOpportunity[]): Promise<TeamRunResult> {
    if (this.running) {
      return { ok: false, written: [], errors: ['Já existe uma execução do time em andamento.'], dir: '' };
    }
    this.running = true;
    const written: string[] = [];
    const errors: string[] = [];
    let dir = '';
    try {
      dir = getOportunidadesDir();
      const db = getDb();
      const agents = db
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.enabled, true))
        .orderBy(asc(schema.agents.sort_order), asc(schema.agents.id))
        .all();

      if (agents.length === 0) {
        this.emit('progress', { type: 'error', error: 'Nenhum agente ativo.' } as TeamProgressEvent);
        return { ok: false, written, errors: ['Nenhum agente ativo para executar.'], dir };
      }

      const oppTotal = opps.length;
      for (let oi = 0; oi < opps.length; oi++) {
        const opp = opps[oi];
        const when = new Date();
        this.emit('progress', {
          type: 'opp-start',
          oppIndex: oi + 1,
          oppTotal,
          oppTitle: opp.title,
        } as TeamProgressEvent);

        const sections: Array<{ agent: string; output: string; ok: boolean }> = [];
        let handoff = '';

        for (let ai = 0; ai < agents.length; ai++) {
          const agent = agents[ai];
          this.emit('progress', {
            type: 'agent-start',
            oppIndex: oi + 1,
            oppTotal,
            oppTitle: opp.title,
            agentIndex: ai + 1,
            agentTotal: agents.length,
            agentName: agent.name,
            agentIcon: agent.icon || agent.slug,
          } as TeamProgressEvent);

          const prompt = buildPrompt(agent, opp, handoff, ai, agents.length);
          let output = '';
          let ok = false;
          try {
            const proc = ClaudeExecutionService.execute({
              prompt,
              model: agent.model ?? undefined,
              maxTokens: agent.max_tokens ?? undefined,
              timeoutSeconds: agent.timeout_seconds ?? 300,
              env: { FREELA_RADAR_AGENT: agent.slug, FREELA_RADAR_PIPELINE: '1' },
            });
            const result = await proc.done;
            if (result.code === 0 && result.stdout.trim()) {
              output = result.stdout.trim();
              ok = true;
            } else {
              const reason = (result.stderr || `processo encerrou com código ${result.code}`).trim();
              output = `> ⚠️ Falha no agente **${agent.name}**: ${reason.slice(0, 500)}`;
              errors.push(`${opp.title} / ${agent.name}: ${reason.slice(0, 200)}`);
            }
          } catch (e) {
            const msg = (e as Error).message;
            output = `> ⚠️ Erro ao executar **${agent.name}**: ${msg}`;
            errors.push(`${opp.title} / ${agent.name}: ${msg}`);
          }

          sections.push({ agent: agent.name, output, ok });
          // Handoff DIRETO: sempre repassa o resultado do agente imediatamente
          // anterior adiante — sem questionar se "deu certo". Cada agente segue
          // o que recebeu e produz a sua própria parte por cima.
          handoff = output;

          this.emit('progress', {
            type: 'agent-done',
            oppIndex: oi + 1,
            oppTotal,
            agentIndex: ai + 1,
            agentTotal: agents.length,
            agentName: agent.name,
          } as TeamProgressEvent);
        }

        const md = buildMarkdown(opp, agents, sections, when);
        const filename = `${opp.id}_${slugForFilename(opp.title, 'vaga')}_${timestampForFilename(when)}.md`;
        const filePath = path.join(dir, filename);
        try {
          fs.writeFileSync(filePath, md, 'utf-8');
          written.push(filePath);
          this.emit('progress', {
            type: 'opp-done',
            oppIndex: oi + 1,
            oppTotal,
            oppTitle: opp.title,
            filePath,
          } as TeamProgressEvent);
        } catch (e) {
          errors.push(`Falha ao gravar ${filename}: ${(e as Error).message}`);
        }
      }

      ActivityLogger.log({
        type: 'document',
        title: 'Time de agentes executado',
        description: `${written.length} documento(s) gerado(s) em oportunidades/`,
        metadata: { written: written.length, errors: errors.length },
      });
      this.emit('progress', { type: 'done', filePath: dir } as TeamProgressEvent);
      return { ok: errors.length === 0, written, errors, dir };
    } catch (e) {
      const msg = (e as Error).message;
      this.emit('progress', { type: 'error', error: msg } as TeamProgressEvent);
      return { ok: false, written, errors: [...errors, msg], dir };
    } finally {
      this.running = false;
    }
  }
}

export const TeamPipeline = new TeamPipelineImpl();
