import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { MatchEngine } from '../services/MatchEngine';
import { ActivityLogger } from '../services/ActivityLogger';

interface ScanResult {
  site: string;
  found: number;
  inserted: number;
  durationMs: number;
}

class ScanSchedulerImpl extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(intervalMinutes = 5) {
    this.stop();
    const ms = Math.max(1, intervalMinutes) * 60 * 1000;
    this.timer = setInterval(() => {
      this.runAll().catch((err) => console.error('[ScanScheduler] periodic scan error', err));
    }, ms);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOne(siteSlug: string): Promise<ScanResult> {
    return this.runProviders([siteSlug]);
  }

  async runAll(): Promise<ScanResult> {
    const db = getDb();
    const sites = db.select().from(schema.monitored_sites).all();
    const activeSlugs = sites.filter((s) => s.status === 'active').map((s) => s.slug);
    return this.runProviders(activeSlugs);
  }

  private async runProviders(slugs: string[]): Promise<ScanResult> {
    if (this.running) {
      return { site: 'busy', found: 0, inserted: 0, durationMs: 0 };
    }
    this.running = true;
    const startedAt = Date.now();
    const db = getDb();
    let totalFound = 0;
    let totalInserted = 0;

    try {
      for (const slug of slugs) {
        const provider = ProviderRegistry.get(slug);
        if (!provider) continue;
        const site = db.select().from(schema.monitored_sites).where(eq(schema.monitored_sites.slug, slug)).get();
        if (!site) continue;

        try {
          const raw = await provider.scan();
          totalFound += raw.length;

          for (const r of raw) {
            const scored = MatchEngine.score(r);
            // dedup by source_url (best-effort)
            const existing = r.source_url
              ? db.select().from(schema.opportunities).where(eq(schema.opportunities.source_url, r.source_url)).get()
              : undefined;
            if (existing) continue;

            // Persiste só no banco. NÃO gravamos JSON em {workspace}/freelas/:
            // aquela pasta é a fonte de verdade (raspagens externas) e não deve
            // receber dados gerados pelo app.
            db
              .insert(schema.opportunities)
              .values({
                title: scored.title,
                description: scored.description ?? '',
                source_site_id: site.id,
                source_url: scored.source_url,
                budget_min: scored.budget_min,
                budget_max: scored.budget_max,
                currency: scored.currency ?? 'BRL',
                match_score: scored.match_score,
                detected_tags: JSON.stringify(scored.detected_tags),
                status: 'new',
                found_at: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
              })
              .run();
            totalInserted++;
          }

          db.update(schema.monitored_sites).set({
            last_scan_at: new Date(),
            opportunity_count: (site.opportunity_count ?? 0) + raw.length,
            updated_at: new Date(),
          }).where(eq(schema.monitored_sites.id, site.id)).run();

        } catch (err) {
          ActivityLogger.log({
            type: 'error',
            title: `Erro ao varrer ${provider.name}`,
            description: String((err as Error).message ?? err),
          });
        }
      }

      const durationMs = Date.now() - startedAt;

      if (totalInserted > 0) {
        ActivityLogger.log({
          type: 'scan',
          title: 'Varredura concluída',
          description: `${totalInserted} nova${totalInserted === 1 ? '' : 's'} oportunidade${totalInserted === 1 ? '' : 's'} encontrada${totalInserted === 1 ? '' : 's'}`,
        });
      } else {
        ActivityLogger.log({
          type: 'scan',
          title: 'Varredura concluída',
          description: 'Nenhuma nova oportunidade encontrada',
        });
      }

      const result: ScanResult = { site: slugs.join(','), found: totalFound, inserted: totalInserted, durationMs };
      this.emit('scan:complete', result);
      return result;
    } finally {
      this.running = false;
    }
  }
}

export const ScanScheduler = new ScanSchedulerImpl();
