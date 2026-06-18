import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { AgentRunner, type AgentRunEvent } from './AgentRunner';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

/**
 * Lê uma setting numérica do DB com fallback. Lazy — sem cache — pra que
 * mudanças em Settings tenham efeito sem precisar reiniciar o app.
 */
function getSettingInt(key: string, fallback: number): number {
  try {
    const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    const parsed = row?.value ? parseInt(row.value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

class OrchestratorImpl extends EventEmitter {
  private active = new Map<number, AgentRunner>(); // runId → runner
  private queue: Array<{ agentId: number; opportunityId: number | null }> = [];

  private get maxConcurrency(): number {
    return getSettingInt('claude.max_concurrency', 3);
  }

  private get queueMax(): number {
    return getSettingInt('claude.queue_max', 50);
  }

  async enqueue(agentId: number, opportunityId: number | null = null) {
    if (this.active.size >= this.maxConcurrency) {
      if (this.queue.length >= this.queueMax) {
        const err = new Error(`Fila cheia (${this.queueMax}) — aumente claude.queue_max ou aguarde.`);
        this.emit('event', { runId: -1, agentId, status: 'failed', error: err.message });
        throw err;
      }
      this.queue.push({ agentId, opportunityId });
      this.emit('queued', { agentId, opportunityId, queueSize: this.queue.length });
      return null;
    }
    return this.spawn(agentId, opportunityId);
  }

  private async spawn(agentId: number, opportunityId: number | null) {
    const runner = await AgentRunner.start(agentId, opportunityId);
    this.active.set(runner.runId, runner);
    runner.on('event', (evt: AgentRunEvent) => {
      this.emit('event', evt);
      if (evt.status === 'completed' || evt.status === 'failed' || evt.status === 'cancelled') {
        this.active.delete(runner.runId);
        this.drain();
      }
    });
    return runner.runId;
  }

  private async drain() {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      await this.spawn(next.agentId, next.opportunityId);
    }
  }

  /**
   * Cancela uma run em qualquer estado:
   *  - Em execução (`active`): mata o processo + marca cancelled no DB
   *  - Na fila (`queue`): remove do array
   *  - Não-conhecida: marca como cancelled no DB se existir, pra refletir na UI
   */
  cancel(runId: number): boolean {
    const runner = this.active.get(runId);
    if (runner) {
      runner.cancel();
      return true;
    }
    // Se a run não tá em active, pode estar no DB como queued/running órfão (ex: app reiniciou no meio)
    try {
      const db = getDb();
      const row = db.select().from(schema.agent_runs).where(eq(schema.agent_runs.id, runId)).get();
      if (row && (row.status === 'queued' || row.status === 'running')) {
        db.update(schema.agent_runs)
          .set({ status: 'cancelled', completed_at: new Date(), current_step: 'Cancelado' })
          .where(eq(schema.agent_runs.id, runId))
          .run();
        this.emit('event', {
          runId,
          agentId: row.agent_id,
          status: 'cancelled',
          progress: 0,
          current_step: 'Cancelado',
        });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  listActive(): number[] {
    return [...this.active.keys()];
  }
}

export const AgentOrchestrator = new OrchestratorImpl();
