import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export interface RawOpportunity {
  title: string;
  description?: string;
  source_site_id?: number;
  source_url?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  raw_tags?: string[];
}

export interface ScoredOpportunity extends RawOpportunity {
  detected_tags: string[];
  match_score: number;
}

/** Parâmetros configuráveis do motor de match (aba Settings → Match Engine). */
export interface MatchOptions {
  /** Casa a tag só como palavra inteira (\bAPI\b) em vez de substring. */
  wholeWord: boolean;
  /** Diferencia maiúsculas/minúsculas no match. */
  caseSensitive: boolean;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  // Palavra inteira por padrão: evita falsos positivos como a tag "ia" casando
  // dentro de "empresarial", ou "api" dentro de "rapidez".
  wholeWord: true,
  caseSensitive: false,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MatchEngine {
  /**
   * Lê as opções do motor a partir da tabela `settings` (chaves `match.*`),
   * caindo nos defaults quando ausentes. Mantém o comportamento atual até o
   * usuário mexer na aba Match Engine.
   */
  static readOptions(): MatchOptions {
    const db = getDb();
    const rows = db.select().from(schema.settings).all();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const bool = (key: string, fallback: boolean) => {
      const v = map.get(key);
      return v == null || v === '' ? fallback : v === 'true';
    };
    return {
      wholeWord: bool('match.whole_word', DEFAULT_MATCH_OPTIONS.wholeWord),
      caseSensitive: bool('match.case_sensitive', DEFAULT_MATCH_OPTIONS.caseSensitive),
    };
  }

  /** Verifica se uma tag está presente no texto, respeitando as opções. */
  private static hasTag(text: string, name: string, opts: MatchOptions): boolean {
    if (!name) return false;
    if (opts.wholeWord) {
      const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, opts.caseSensitive ? '' : 'i');
      return re.test(text);
    }
    return opts.caseSensitive
      ? text.includes(name)
      : text.toLowerCase().includes(name.toLowerCase());
  }
  /** Tags ativas do radar. Buscar uma vez e reusar ao classificar muitos JSONs. */
  static getActiveTags(): Array<{ name: string; weight: number | null }> {
    const db = getDb();
    return db.select().from(schema.radar_tags).where(eq(schema.radar_tags.active, true)).all();
  }

  /**
   * Classifica um texto contra um conjunto de tags já carregado. Score =
   * (sum(weight das tags presentes no texto) / sum(weight de todas as tags)) * 100.
   * `detected_tags` traz só as tags que aparecem no texto. Versão sem I/O —
   * ideal para classificar muitas vagas reusando as mesmas tags/options.
   */
  static scoreTextWithTags(
    text: string,
    tags: ReadonlyArray<{ name: string; weight: number | null }>,
    opts?: Partial<MatchOptions>,
  ): { detected_tags: string[]; match_score: number } {
    const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...(opts ?? {}) };
    if (!tags || tags.length === 0) return { detected_tags: [], match_score: 0 };

    const detected: string[] = [];
    let matched = 0;
    let total = 0;
    for (const tag of tags) {
      const weight = tag.weight ?? 1;
      total += weight;
      if (MatchEngine.hasTag(text, tag.name, options)) {
        matched += weight;
        detected.push(tag.name);
      }
    }
    const score = total > 0 ? Math.round((matched / total) * 100) : 0;
    return { detected_tags: detected, match_score: score };
  }

  /**
   * Classifica um texto livre (ex: título + descrição de uma vaga) contra as
   * tags ativas do radar (busca as tags no DB a cada chamada).
   */
  static scoreText(
    text: string,
    opts?: Partial<MatchOptions>,
  ): { detected_tags: string[]; match_score: number } {
    return MatchEngine.scoreTextWithTags(text, MatchEngine.getActiveTags(), opts);
  }

  /**
   * Calcula score 0-100 baseado nas tags ativas do radar.
   * Score = (sum(weight de tags batendo) / sum(weight de tags ativas)) * 100
   * Mínimo de 1 tag pra retornar score > 0.
   */
  static score(opp: RawOpportunity): ScoredOpportunity {
    const db = getDb();
    const tags = db.select().from(schema.radar_tags).where(eq(schema.radar_tags.active, true)).all();
    if (tags.length === 0) {
      return { ...opp, detected_tags: opp.raw_tags ?? [], match_score: 0 };
    }

    const haystack = `${opp.title} ${opp.description ?? ''} ${(opp.raw_tags ?? []).join(' ')}`.toLowerCase();
    const detected: string[] = [];
    let matched = 0;
    let total = 0;

    for (const tag of tags) {
      const weight = tag.weight ?? 1;
      total += weight;
      const needle = tag.name.toLowerCase();
      if (haystack.includes(needle)) {
        matched += weight;
        detected.push(tag.name);
      }
    }

    // also keep raw tags that came from the provider, dedup
    for (const t of opp.raw_tags ?? []) {
      if (!detected.find((d) => d.toLowerCase() === t.toLowerCase())) detected.push(t);
    }

    const score = total > 0 ? Math.round((matched / total) * 100) : 0;
    return { ...opp, detected_tags: detected, match_score: score };
  }
}
