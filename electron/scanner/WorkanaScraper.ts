import { EventEmitter } from 'node:events';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { getFreelasDir, writeScrapedOpportunity } from '../services/ExecutionStorage';
import { ActivityLogger } from '../services/ActivityLogger';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

/** Opções enviadas pela UI para iniciar uma raspagem. */
export interface ScrapperOptions {
  /** URL inicial — precisa ser do workana.com. */
  url: string;
  /** Quantidade de páginas a percorrer (1..N). */
  pages: number;
  /** Headless (default true). */
  headless?: boolean;
  /** Pausa MÍNIMA (ms) entre a leitura de uma vaga e a próxima (anti-spam). */
  delayMinMs?: number;
  /** Pausa MÁXIMA (ms) — o tempo real é sorteado entre min e max a cada vaga. */
  delayMaxMs?: number;
}

/** Vaga já extraída, no formato resumido enviado ao log da UI. */
export interface ScrapperJob {
  title: string;
  url: string;
  budget: string | null;
  tags: string[];
}

/** Evento de progresso emitido durante a raspagem (streaming para a UI). */
export interface ScrapperEvent {
  type: 'start' | 'page' | 'job' | 'log' | 'done' | 'error' | 'cancelled';
  page?: number;
  totalPages?: number;
  jobsOnPage?: number;
  totalJobs?: number;
  savedJobs?: number;
  job?: ScrapperJob;
  message?: string;
  level?: 'info' | 'success' | 'warn' | 'error';
  error?: string;
  dir?: string;
  filePath?: string;
}

/** Resultado final retornado pelo handle (resolve quando a raspagem termina). */
export interface ScrapperResult {
  ok: boolean;
  totalJobs: number;
  savedJobs: number;
  dir: string;
  error?: string;
}

/** Objeto bruto devolvido pelo extrator que roda no contexto da página. */
interface RawScraped {
  title: string;
  url: string;
  description: string;
  skills: string[];
  budgetText: string;
  postedText: string;
  proposalsText: string;
  strategy: string;
}

const WORKANA_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** System prompt padrão do scraper (configurável em Settings → Playwright). */
export const DEFAULT_PLAYWRIGHT_SYSTEM_PROMPT =
  'Você é um agente de raspagem de vagas do Workana. Extraia título, descrição completa, ' +
  'orçamento, skills e URL de cada oportunidade com fidelidade ao original, sem inventar dados. ' +
  'Preserve o texto em português e normalize apenas espaços e quebras de linha.';

type BrowserChannelPref = 'auto' | 'chromium' | 'msedge' | 'chrome';

/** Config efetiva do Playwright, resolvida a partir das settings (Settings → Playwright). */
interface PlaywrightConfig {
  headless: boolean;
  channel: BrowserChannelPref;
  userAgent: string;
  locale: string;
  viewportW: number;
  viewportH: number;
  navTimeout: number;
  selectorTimeout: number;
  networkidleTimeout: number;
  pagePause: number;
  delayMin: number;
  delayMax: number;
  blockResources: boolean;
  maxPages: number;
  systemPrompt: string;
}

/**
 * Lê as configurações do Playwright da tabela `settings` (chaves `playwright.*`),
 * caindo nos defaults quando ausentes. Persistido pela aba Settings → Playwright.
 */
function readPlaywrightConfig(): PlaywrightConfig {
  let map = new Map<string, string>();
  try {
    const rows = getDb().select().from(schema.settings).all();
    map = new Map(rows.map((r) => [r.key, r.value ?? '']));
  } catch {
    /* sem DB acessível → defaults */
  }
  const str = (k: string, d: string) => {
    const v = map.get(k);
    return v == null || v === '' ? d : v;
  };
  const num = (k: string, d: number) => {
    const v = map.get(k);
    if (v == null || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = map.get(k);
    return v == null || v === '' ? d : v === 'true';
  };
  const chRaw = str('playwright.browser_channel', 'auto');
  const channel: BrowserChannelPref = (
    ['auto', 'chromium', 'msedge', 'chrome'].includes(chRaw) ? chRaw : 'auto'
  ) as BrowserChannelPref;
  return {
    headless: bool('playwright.headless', true),
    channel,
    userAgent: str('playwright.user_agent', WORKANA_UA),
    locale: str('playwright.locale', 'pt-BR'),
    viewportW: Math.max(320, num('playwright.viewport_width', 1366)),
    viewportH: Math.max(320, num('playwright.viewport_height', 900)),
    navTimeout: Math.max(1000, num('playwright.nav_timeout_ms', 45_000)),
    selectorTimeout: Math.max(1000, num('playwright.selector_timeout_ms', 15_000)),
    networkidleTimeout: Math.max(0, num('playwright.networkidle_timeout_ms', 8_000)),
    pagePause: Math.max(0, num('playwright.page_pause_ms', 700)),
    delayMin: Math.max(0, num('playwright.delay_min_ms', 2_000)),
    delayMax: Math.max(0, num('playwright.delay_max_ms', 5_000)),
    blockResources: bool('playwright.block_resources', false),
    maxPages: Math.max(1, Math.min(200, num('playwright.max_pages', 50))),
    systemPrompt: str('playwright.system_prompt', DEFAULT_PLAYWRIGHT_SYSTEM_PROMPT),
  };
}

/**
 * Serviço de raspagem do Workana. Abre um Chromium real (Playwright), percorre
 * as páginas pedidas, extrai cada vaga e grava no formato JSON de
 * `{workspace}/freelas/`. Emite eventos de progresso em tempo real (evento
 * `'event'`), no mesmo padrão de streaming do AgentOrchestrator/TeamPipeline.
 */
class WorkanaScraperImpl extends EventEmitter {
  private running = false;
  private cancelled = false;
  private browser: Browser | null = null;

  isRunning() {
    return this.running;
  }

  private emitEvent(evt: ScrapperEvent) {
    this.emit('event', evt);
  }

  private log(message: string, level: ScrapperEvent['level'] = 'info') {
    this.emitEvent({ type: 'log', message, level });
  }

  /** Inicia a raspagem. Resolve com o resultado final; progresso vem por eventos. */
  async start(opts: ScrapperOptions): Promise<ScrapperResult> {
    if (this.running) {
      const msg = 'Já existe uma raspagem em andamento.';
      this.emitEvent({ type: 'error', level: 'error', error: msg });
      return { ok: false, totalJobs: 0, savedJobs: 0, dir: '', error: msg };
    }

    // Valida URL / domínio.
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      const msg = `URL inválida: "${opts.url}".`;
      this.emitEvent({ type: 'error', level: 'error', error: msg });
      return { ok: false, totalJobs: 0, savedJobs: 0, dir: '', error: msg };
    }
    if (!/(^|\.)workana\.com$/i.test(parsed.hostname)) {
      const msg = `A URL precisa ser do Workana (workana.com). Recebido: ${parsed.hostname}`;
      this.emitEvent({ type: 'error', level: 'error', error: msg });
      return { ok: false, totalJobs: 0, savedJobs: 0, dir: '', error: msg };
    }

    // Config do Playwright vinda das settings (Settings → Playwright). As opções
    // por execução (vindas da tela Scrapper) têm prioridade sobre os defaults.
    const cfg = readPlaywrightConfig();
    const totalPages = Math.max(1, Math.min(cfg.maxPages, Math.floor(opts.pages) || 1));
    const headless = opts.headless ?? cfg.headless;
    const clampDelay = (v: number) => Math.max(0, Math.min(60_000, Math.floor(v)));
    const delayMin = clampDelay(opts.delayMinMs ?? cfg.delayMin);
    const delayMax = Math.max(delayMin, clampDelay(opts.delayMaxMs ?? cfg.delayMax));

    // Resolve a pasta freelas/ cedo: se o workspace não estiver configurado,
    // falha já com mensagem clara (em vez de só depois de abrir o navegador).
    let dir: string;
    try {
      dir = getFreelasDir();
    } catch (e) {
      const msg = (e as Error).message;
      this.emitEvent({ type: 'error', level: 'error', error: msg });
      return { ok: false, totalJobs: 0, savedJobs: 0, dir: '', error: msg };
    }

    this.running = true;
    this.cancelled = false;
    let context: BrowserContext | null = null;
    let totalJobs = 0;
    let savedJobs = 0;
    const seenUrls = new Set<string>();
    const collected: Array<{ raw: RawScraped; canonical: string; page: number }> = [];

    this.emitEvent({ type: 'start', totalPages, dir });
    this.log(`🚀 Iniciando raspagem do Workana · ${totalPages} página(s)`, 'info');
    if (cfg.systemPrompt.trim()) {
      this.log(`📋 System prompt carregado (${cfg.systemPrompt.trim().length} caracteres)`, 'info');
    }

    try {
      this.log(`🤖 Abrindo navegador (${headless ? 'headless' : 'visível'} · ${cfg.channel})…`, 'info');
      this.browser = await this.launchBrowser(headless, cfg.channel);
      context = await this.browser.newContext({
        userAgent: cfg.userAgent,
        locale: cfg.locale,
        viewport: { width: cfg.viewportW, height: cfg.viewportH },
      });

      // Bloqueia imagens/fontes/mídia pra acelerar (não afeta a extração de texto).
      if (cfg.blockResources) {
        this.log('🚫 Bloqueando imagens/fontes/mídia (modo rápido)…', 'info');
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'image' || type === 'font' || type === 'media') route.abort().catch(() => undefined);
          else route.continue().catch(() => undefined);
        });
      }

      const page = await context.newPage();

      // ── FASE 1: varrer as listagens e coletar as vagas (sem descrição completa) ──
      for (let i = 1; i <= totalPages; i++) {
        if (this.cancelled) break;

        const pageUrl = this.buildPageUrl(parsed, i);
        this.log(`📄 Carregando página ${i}/${totalPages} → ${pageUrl}`, 'info');

        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout });
          // Espera os cards renderizarem (Workana monta a lista via JS).
          await page
            .waitForSelector('a[href*="/job/"]', { timeout: cfg.selectorTimeout })
            .catch(() => undefined);
          if (cfg.networkidleTimeout > 0) {
            await page.waitForLoadState('networkidle', { timeout: cfg.networkidleTimeout }).catch(() => undefined);
          }
        } catch (e) {
          this.log(`⚠️ Falha ao carregar a página ${i}: ${(e as Error).message}`, 'warn');
          continue;
        }

        if (this.cancelled) break;

        const raws = await page.evaluate(extractJobsInPage).catch((e) => {
          this.log(`⚠️ Erro extraindo a página ${i}: ${(e as Error).message}`, 'warn');
          return [] as RawScraped[];
        });

        let novas = 0;
        for (const raw of raws) {
          const canonical = canonicalUrl(raw.url);
          if (!canonical || seenUrls.has(canonical)) continue;
          seenUrls.add(canonical);
          collected.push({ raw, canonical, page: i });
          novas++;
        }
        totalJobs = collected.length;
        const strategy = raws[0]?.strategy ?? 'nenhuma';
        this.emitEvent({
          type: 'page',
          page: i,
          totalPages,
          jobsOnPage: novas,
          totalJobs,
          message: `🔎 Página ${i}: ${raws.length} vaga(s) detectada(s), ${novas} nova(s) (estratégia: ${strategy})`,
          level: raws.length > 0 ? 'info' : 'warn',
        });

        // Pausa curta entre páginas de listagem (cortesia / configurável).
        if (i < totalPages && !this.cancelled && cfg.pagePause > 0) {
          await page.waitForTimeout(cfg.pagePause).catch(() => undefined);
        }
      }

      // ── FASE 2: abrir cada vaga, ler a descrição completa e gravar o JSON ──
      const total = collected.length;
      if (!this.cancelled) {
        this.log(
          `🔍 ${total} vaga(s) coletada(s). Lendo a descrição completa de cada uma…`,
          'info',
        );
      }

      for (let k = 0; k < total; k++) {
        if (this.cancelled) break;
        const { raw, canonical, page: srcPage } = collected[k];

        this.log(`🌐 [${k + 1}/${total}] Abrindo vaga: ${raw.title}`, 'info');

        // Abre o detalhe pra ler o TÍTULO completo (h1) e a descrição completa
        // (.expander). Cai pro título/descrição da listagem se algo falhar.
        let detail: { title: string; description: string } = { title: '', description: '' };
        try {
          await page.goto(canonical, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout });
          await page
            .waitForSelector('h1, article .expander, .expander, article', { timeout: cfg.selectorTimeout })
            .catch(() => undefined);
          detail = await page
            .evaluate(extractDetailInfo)
            .catch(() => ({ title: '', description: '' }));
        } catch (e) {
          this.log(`⚠️ Não consegui abrir o detalhe de "${raw.title}": ${(e as Error).message}`, 'warn');
        }

        // Título: prioriza o h1 do detalhe (nunca truncado); senão o da listagem.
        const title = detail.title || raw.title;
        const description =
          detail.description && detail.description.length > raw.description.length
            ? detail.description
            : raw.description;
        if (detail.description && detail.description.length > raw.description.length) {
          this.log(`📝 Descrição completa lida (${detail.description.length} caracteres)`, 'info');
        }

        const budget = parseBudget(raw.budgetText);
        const id = stableId(canonical);
        const nowIso = new Date().toISOString();
        const payload = {
          id,
          title,
          description,
          source_site_id: null as number | null,
          source_url: canonical,
          budget_min: budget.min,
          budget_max: budget.max,
          currency: budget.currency,
          match_score: 0,
          status: 'new',
          detected_tags: raw.skills,
          found_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
          // Metadados extras do scraping (ignorados pelo leitor de freelas/).
          platform: 'workana',
          posted_at_text: raw.postedText || null,
          budget_text: raw.budgetText || null,
          proposals_text: raw.proposalsText || null,
          page: srcPage,
          scraped_at: nowIso,
        };

        const jobSummary: ScrapperJob = {
          title,
          url: canonical,
          budget: raw.budgetText || formatBudget(budget),
          tags: raw.skills,
        };

        try {
          const filePath = writeScrapedOpportunity(payload);
          savedJobs++;
          this.emitEvent({
            type: 'job',
            job: jobSummary,
            totalJobs: total,
            savedJobs,
            filePath,
            level: 'success',
          });
        } catch (e) {
          this.log(`❌ Falha ao gravar "${raw.title}": ${(e as Error).message}`, 'error');
        }

        // Sleep ALEATÓRIO entre min e max a cada vaga (anti-spam): um intervalo
        // variável é mais difícil de detectar como bot do que um fixo.
        if (k < total - 1 && !this.cancelled && delayMax > 0) {
          const wait =
            delayMin >= delayMax
              ? delayMin
              : delayMin + Math.floor(Math.random() * (delayMax - delayMin + 1));
          this.log(`💤 Aguardando ${(wait / 1000).toFixed(1)}s antes da próxima vaga…`, 'info');
          await page.waitForTimeout(wait).catch(() => undefined);
        }
      }

      if (this.cancelled) {
        this.log(`🛑 Raspagem cancelada. ${savedJobs} vaga(s) salva(s).`, 'warn');
        ActivityLogger.log({
          type: 'scan',
          title: 'Raspagem do Workana cancelada',
          description: `${savedJobs} vaga(s) salva(s) em freelas/`,
          metadata: { totalJobs, savedJobs, cancelled: true },
        });
        this.emitEvent({ type: 'cancelled', totalJobs, savedJobs, dir });
        return { ok: false, totalJobs, savedJobs, dir, error: 'cancelado' };
      }

      this.log(`🎉 Raspagem concluída · ${savedJobs} vaga(s) salva(s) em freelas/`, 'success');
      ActivityLogger.log({
        type: 'scan',
        title: 'Raspagem do Workana concluída',
        description: `${savedJobs} vaga(s) salva(s) em freelas/ (de ${totalJobs} detectada(s))`,
        metadata: { totalJobs, savedJobs, pages: totalPages },
      });
      this.emitEvent({ type: 'done', totalJobs, savedJobs, dir });
      return { ok: true, totalJobs, savedJobs, dir };
    } catch (e) {
      const msg = (e as Error).message;
      this.log(`❌ Erro fatal na raspagem: ${msg}`, 'error');
      ActivityLogger.log({
        type: 'error',
        title: 'Erro na raspagem do Workana',
        description: msg,
        metadata: { totalJobs, savedJobs },
      });
      this.emitEvent({ type: 'error', level: 'error', error: msg, totalJobs, savedJobs, dir });
      return { ok: false, totalJobs, savedJobs, dir, error: msg };
    } finally {
      try {
        await context?.close();
      } catch {
        /* ignore */
      }
      try {
        await this.browser?.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
      this.running = false;
    }
  }

  /** Pede o cancelamento da raspagem em andamento (fecha o navegador). */
  cancel(): boolean {
    if (!this.running) return false;
    this.cancelled = true;
    this.log('🛑 Cancelando raspagem…', 'warn');
    // Fecha o browser pra interromper goto/evaluate pendentes; o loop detecta
    // `cancelled` e finaliza graciosamente.
    this.browser?.close().catch(() => undefined);
    return true;
  }

  /**
   * Lança o navegador conforme a preferência de canal. `auto` tenta o Chromium
   * do Playwright e cai para Edge/Chrome do sistema; um canal específico tenta
   * ele primeiro e usa os demais como fallback.
   */
  private async launchBrowser(headless: boolean, channel: BrowserChannelPref): Promise<Browser> {
    const args = ['--disable-blink-features=AutomationControlled', '--no-sandbox'];
    const defs: Record<'chromium' | 'msedge' | 'chrome', { label: string; launch: () => Promise<Browser> }> = {
      chromium: { label: 'Chromium', launch: () => chromium.launch({ headless, args }) },
      msedge: { label: 'Edge', launch: () => chromium.launch({ headless, channel: 'msedge', args }) },
      chrome: { label: 'Chrome', launch: () => chromium.launch({ headless, channel: 'chrome', args }) },
    };
    const base: Array<'chromium' | 'msedge' | 'chrome'> = ['chromium', 'msedge', 'chrome'];
    const order =
      channel === 'auto' ? base : [channel, ...base.filter((c) => c !== channel)];

    let lastErr: unknown;
    for (const key of order) {
      const a = defs[key];
      try {
        return await a.launch();
      } catch (e) {
        lastErr = e;
        this.log(`⚠️ Navegador "${a.label}" indisponível, tentando próximo…`, 'warn');
      }
    }
    throw new Error(
      `Não foi possível abrir um navegador (Chromium/Edge/Chrome): ${(lastErr as Error)?.message ?? lastErr}`,
    );
  }

  /** Clona a URL inicial e fixa o parâmetro `page` para a página i. */
  private buildPageUrl(base: URL, page: number): string {
    const u = new URL(base.toString());
    u.searchParams.set('page', String(page));
    return u.toString();
  }
}

/* ───────────────────────── helpers (rodam no Node) ───────────────────────── */

/** Normaliza a URL da vaga: remove query/hash e barra final. */
function canonicalUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Inteiro positivo estável derivado da URL (hash tipo Java string). */
function stableId(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 31) + url.charCodeAt(i)) | 0;
  }
  // 0 quebraria o nome do arquivo/abertura; garante >= 1.
  return Math.abs(h) || 1;
}

/** Converte um token numérico do Workana ("1.000", "100") em inteiro. */
function normalizeNumber(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta o texto de orçamento do Workana e devolve faixa + moeda. O texto
 * vem só do bloco `.budget/.values` (sem ruído), então é seguro extrair todos
 * os tokens numéricos. Cobre: "Menos de USD 50", "Mais de USD 3.000",
 * "USD 1.000 - 3.000", "USD 15 - 45 / hora", "R$ 600 - 1.200", "A combinar".
 */
function parseBudget(text: string): { min: number | null; max: number | null; currency: string } {
  const t = (text || '').trim();
  const currency = /R\$/.test(t) ? 'BRL' : /US\$|USD|\$/.test(t) ? 'USD' : 'BRL';
  if (!t) return { min: null, max: null, currency };
  const tokens = t.match(/\d[\d.,]*/g) ?? [];
  const nums = tokens.map(normalizeNumber).filter((n): n is number => n != null);
  if (nums.length === 0) return { min: null, max: null, currency };
  if (/menos de|less than|up to|at[eé]\b/i.test(t)) return { min: null, max: nums[0], currency };
  if (/mais de|more than|acima/i.test(t)) return { min: nums[0], max: null, currency };
  if (nums.length >= 2) {
    const a = nums[0];
    const b = nums[1];
    return { min: Math.min(a, b), max: Math.max(a, b), currency };
  }
  return { min: nums[0], max: nums[0], currency };
}

/** Texto curto de orçamento para o log quando não há `budgetText` original. */
function formatBudget(b: { min: number | null; max: number | null; currency: string }): string | null {
  if (b.min == null && b.max == null) return null;
  const sym = b.currency === 'BRL' ? 'R$' : 'US$';
  if (b.min != null && b.max != null) return `${sym} ${b.min} – ${sym} ${b.max}`;
  if (b.max != null) return `até ${sym} ${b.max}`;
  return `a partir de ${sym} ${b.min}`;
}

/* ─────────────── extrator que roda DENTRO da página (browser) ─────────────── */
/**
 * IMPORTANTE: esta função é serializada e executada no contexto do navegador
 * (page.evaluate). Não pode referenciar nada do escopo Node — tudo é inline.
 * Como o tsconfig do main não inclui a lib DOM, o `document` e os elementos são
 * tratados como `any` (os tipos não importam: o código roda no Chromium).
 * Estratégia em camadas: tenta seletores conhecidos do Workana e, se a lista
 * vier vazia, cai num fallback genérico baseado nos links `/job/`.
 */
function extractJobsInPage(): RawScraped[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const doc: any = (globalThis as any).document;
  const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

  const extractFromCard = (card: any, titleAnchor: any, strategy: string): RawScraped => {
    // O texto visível do link vem truncado com "…"; o título COMPLETO fica no
    // atributo `title` (do próprio <a> ou de um <span title="…"> interno).
    const titleAttr =
      titleAnchor.getAttribute?.('title') ||
      titleAnchor.querySelector?.('[title]')?.getAttribute('title') ||
      '';
    const title =
      clean(titleAttr) ||
      clean(titleAnchor.textContent) ||
      clean(card.querySelector('h1,h2,h3')?.textContent);

    // Descrição: tenta seletores conhecidos; senão o texto do card menos o título.
    const descEl =
      card.querySelector('.html-desc') ||
      card.querySelector('.project-details') ||
      card.querySelector('[class*="description"]') ||
      card.querySelector('p');
    let description = clean(descEl?.textContent);
    if (!description) {
      const full = clean(card.textContent);
      description = full.replace(title, '').trim();
    }
    // Remove o rótulo do expander ("Ver mais detalhes"/"...") que o Workana
    // anexa ao fim da descrição resumida.
    description = description.replace(/\s*\.{2,}\s*/g, ' ').replace(/\s*Ver (mais detalhes|menos)\s*$/i, '').trim();
    if (description.length > 1500) description = description.slice(0, 1500) + '…';

    // Skills/tags: chips do card.
    const skillEls: any[] = Array.from(
      card.querySelectorAll('.skills a, .skill, [class*="skill"] a, a[href*="skills="]'),
    );
    const skills: string[] = Array.from(
      new Set(
        skillEls
          .map((el: any) => clean(el.textContent))
          .filter((s: string) => s.length > 1 && s.length < 40),
      ),
    ).slice(0, 20);

    // Orçamento: SOMENTE do bloco de orçamento do card (.budget/.values). Nunca
    // de .bids (= contagem de propostas) nem da descrição (que pode citar valores).
    const budgetEl =
      card.querySelector('.budget .values') ||
      card.querySelector('p.budget') ||
      card.querySelector('.budget') ||
      card.querySelector('.values');
    const budgetText = clean(budgetEl?.textContent);

    // Contagem de propostas (metadado): elemento .bids → "Propostas: N".
    const proposalsText = clean(card.querySelector('.bids, [class*="bids"]')?.textContent);

    // Data de publicação.
    const dateEl = card.querySelector('.date, time, [class*="date"], [class*="time"]');
    const postedText = clean(dateEl?.textContent);

    return {
      title,
      url: titleAnchor.href,
      description,
      skills,
      budgetText,
      postedText,
      proposalsText,
      strategy,
    };
  };

  // ── Estratégia 1: seletores conhecidos do Workana ──
  const knownCards: any[] = Array.from(doc.querySelectorAll('.project-item, .js-project'));
  const out: RawScraped[] = [];
  if (knownCards.length > 0) {
    for (const card of knownCards) {
      const a = card.querySelector('.project-title a') || card.querySelector('a[href*="/job/"]');
      if (!a) continue;
      const job = extractFromCard(card, a, 'project-item');
      if (job.title) out.push(job);
    }
    if (out.length > 0) return out;
  }

  // ── Estratégia 2: fallback genérico via links /job/ ──
  const anchors: any[] = Array.from(doc.querySelectorAll('a[href*="/job/"]'));
  // Mantém, por href, a âncora com mais texto (provável título).
  const byHref = new Map<string, any>();
  for (const a of anchors) {
    const text = clean(a.textContent);
    if (text.length < 8) continue;
    const key = String(a.href).split('?')[0].split('#')[0];
    const prev = byHref.get(key);
    if (!prev || clean(prev.textContent).length < text.length) byHref.set(key, a);
  }

  for (const [, a] of byHref) {
    // Sobe até o ancestral que isola UM card (contém só este link de vaga).
    let chosen: any = a.parentElement ?? a;
    let el: any = a.parentElement;
    for (let hop = 0; hop < 6 && el; hop++) {
      const jobLinks = new Set(
        (Array.from(el.querySelectorAll('a[href*="/job/"]')) as any[]).map(
          (x) => String(x.href).split('?')[0],
        ),
      );
      if (jobLinks.size > 1) break; // passou do card; ancestral anterior é o melhor
      chosen = el;
      el = el.parentElement;
    }
    const job = extractFromCard(chosen, a, 'fallback-link');
    if (job.title) out.push(job);
  }

  return out;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Extrai TÍTULO e descrição COMPLETOS da página de detalhe. Roda no navegador.
 * O título vem do `<h1>` (nunca truncado) e a descrição de `article .expander`
 * (corpo do bloco "Sobre este projeto"); `innerText` preserva quebras de linha.
 */
function extractDetailInfo(): { title: string; description: string } {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const doc: any = (globalThis as any).document;
  const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
  const norm = (s: string | null | undefined) =>
    (s || '')
      .replace(/\r/g, '')
      .replace(/[ \t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const title = clean(doc.querySelector('h1')?.textContent);

  const el =
    doc.querySelector('article .expander') ||
    doc.querySelector('.expander') ||
    doc.querySelector('article');
  let description = '';
  if (el) {
    description = norm(el.innerText || el.textContent)
      .replace(/^Sobre este projeto\s*/i, '')
      .replace(/\s*Ver (mais detalhes|menos)\s*$/i, '')
      .trim();
    if (description.length > 8000) description = description.slice(0, 8000) + '…';
  }
  return { title, description };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export const WorkanaScraper = new WorkanaScraperImpl();
