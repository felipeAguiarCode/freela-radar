import { getRawSqlite } from './client';

/**
 * Aplica o schema diretamente via DDL idempotente. Evita o overhead do
 * drizzle-kit em runtime e funciona perfeitamente para o caso single-process
 * do main do Electron.
 */
export function applySchema() {
  const db = getRawSqlite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      soul_prompt TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      operational_prompt TEXT DEFAULT '',
      output_format TEXT DEFAULT 'markdown',
      effort_level TEXT DEFAULT 'medium',
      autonomy_level TEXT DEFAULT 'semi',
      model TEXT DEFAULT 'sonnet',
      temperature REAL DEFAULT 0.3,
      max_tokens INTEGER DEFAULT 12000,
      retries INTEGER DEFAULT 2,
      timeout_seconds INTEGER DEFAULT 300,
      runtime_config_json TEXT DEFAULT '{}',
      color TEXT DEFAULT 'purple',
      icon TEXT DEFAULT 'FileText',
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS monitored_sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      last_scan_at INTEGER,
      opportunity_count INTEGER DEFAULT 0,
      scan_interval_minutes INTEGER DEFAULT 5,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS radar_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      weight REAL DEFAULT 1.0,
      active INTEGER DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      source_site_id INTEGER REFERENCES monitored_sites(id),
      source_url TEXT,
      budget_min REAL,
      budget_max REAL,
      currency TEXT DEFAULT 'BRL',
      match_score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new',
      detected_tags TEXT DEFAULT '[]',
      found_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      opportunity_id INTEGER REFERENCES opportunities(id),
      status TEXT DEFAULT 'queued',
      progress INTEGER DEFAULT 0,
      current_step TEXT DEFAULT '',
      next_step TEXT DEFAULT '',
      started_at INTEGER,
      completed_at INTEGER,
      logs TEXT DEFAULT '',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'markdown',
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT DEFAULT '',
      encrypted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(match_score DESC);
    CREATE INDEX IF NOT EXISTS idx_opportunities_found ON opportunities(found_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
  `);

  // Migrações idempotentes em DBs antigos — DEVEM vir antes de qualquer CREATE INDEX
  // que referencie as colunas novas, senão a primeira execução em DBs antigos quebra.
  const columns = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE agents ADD COLUMN sort_order INTEGER DEFAULT 0;`);
    db.exec(`UPDATE agents SET sort_order = id WHERE sort_order IS NULL OR sort_order = 0;`);
  }

  // Índices que dependem das colunas migradas — só agora podem ser criados com segurança.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_sort_order ON agents(sort_order);`);

  // Migração de settings: `--cloud-p` (typo legado do specs antigo) → `-p` (flag correta de print mode do Claude CLI).
  db.prepare(
    `UPDATE settings SET value = REPLACE(value, '--cloud-p', '-p') WHERE key = 'claude.flags' AND value LIKE '%--cloud-p%'`,
  ).run();
  // Rename idempotente de `claude.cloud_p` → `claude.print_mode`.
  // Se a UI já criou a chave nova (via sanitização do SettingsPage), as duas
  // existem simultaneamente — nesse caso só removemos a legada, em vez de
  // tentar renomear (que violaria a UNIQUE constraint em settings.key).
  db.prepare(
    `DELETE FROM settings
     WHERE key = 'claude.cloud_p'
       AND EXISTS (SELECT 1 FROM settings WHERE key = 'claude.print_mode')`,
  ).run();
  db.prepare(`UPDATE settings SET key = 'claude.print_mode' WHERE key = 'claude.cloud_p'`).run();

  // Limpa runs órfãs: qualquer execução com status `running` ou `queued` ao
  // iniciar o app só pode ser remanescente de um shutdown anterior — o processo
  // do `claude` CLI morreu junto com a sessão. Marca como `cancelled` pra que a
  // UI reflita o estado real e o usuário possa disparar novas execuções.
  const orphans = db
    .prepare(
      `UPDATE agent_runs
       SET status = 'cancelled',
           completed_at = strftime('%s','now') * 1000,
           current_step = 'Cancelado (app reiniciado)',
           error = COALESCE(error, 'Processo encerrado quando o app foi fechado')
       WHERE status IN ('running','queued')`,
    )
    .run();
  if (orphans.changes > 0) {
    console.log(`[migrate] ${orphans.changes} run(s) órfã(s) marcada(s) como cancelled`);
  }

  // Migração de prompts v2 — atualiza PRD/ADR/Pitch pra refletir o pipeline
  // sequencial PRD → ADR → Pitch. Só atualiza onde o prompt atual ainda é
  // exatamente o default antigo (preserva edições do usuário). Idempotente
  // via flag `seed.prompts_v2_applied`.
  applyAgentPromptsV2(db);
}

interface PromptUpdate {
  slug: string;
  field: 'soul_prompt' | 'system_prompt' | 'operational_prompt';
  old: string;
  next: string;
}

function applyAgentPromptsV2(db: import('better-sqlite3').Database) {
  const applied = db
    .prepare(`SELECT value FROM settings WHERE key = 'seed.prompts_v2_applied'`)
    .get() as { value: string } | undefined;
  if (applied?.value === 'true') return;

  // Defaults LEGADOS — usados pra detectar prompts não-customizados.
  const OLD_SOUL_PRD = `Você é um Product Manager sênior, pragmático e direto. Pensa em outcomes acima de outputs.\nFoca em problemas reais do usuário, em clareza de escopo e em critérios mensuráveis de aceite.\nEscreve em português, tom executivo, sem floreios. Prioriza: jobs to be done, métricas, riscos.`;
  const OLD_SYSTEM_PRD = `Sua missão é gerar um PRD (Product Requirements Document) curto e acionável para a oportunidade de freela analisada.\nEstrutura: Contexto · Problema · Solução proposta · Escopo (in/out) · Requisitos funcionais · Requisitos não-funcionais · Critérios de aceite · Riscos.\nNão inclua cronograma nem orçamento — outro agente cuida disso.`;
  const OLD_OP_PRD = `Sempre comece extraindo a intenção do cliente em uma frase.\nDepois liste 3 hipóteses sobre o que pode estar por trás do pedido.\nTermine com os critérios de aceite numerados e mensuráveis.`;
  const OLD_SOUL_ADR = `Você é um arquiteto de software experiente, pragmático, anti-overengineering.\nPensa em trade-offs concretos: simplicidade vs escala, custo vs latência, build vs buy.\nNão recomenda tecnologias da moda sem motivo. Documenta o porquê das decisões.`;
  const OLD_SYSTEM_ADR = `Sua missão é produzir um ADR (Architecture Decision Record) para a oportunidade.\nEstrutura: Contexto · Forças em jogo · Opções consideradas · Decisão · Justificativa · Consequências (positivas e negativas) · Diagrama de blocos (mermaid).`;
  const OLD_OP_ADR = `Sempre escolha o stack mais simples que resolva o problema.\nConsidere ao menos 3 opções antes de decidir.\nInclua sempre o diagrama mermaid c4 ou de fluxo.`;
  const OLD_SOUL_PITCH = `Você é um vendedor consultivo que fecha contratos de freela alto-ticket.\nVende valor, não horas. Conhece o vocabulário do cliente e demonstra entendimento profundo do problema dele antes de propor solução.`;
  const OLD_SYSTEM_PITCH = `Sua missão é escrever uma proposta de vendas vencedora para a oportunidade.\nEstrutura: Diagnóstico do problema · Proposta de valor em 1 frase · Entregáveis · Como vamos trabalhar · Cronograma sugerido · Investimento · Próximos passos.`;
  const OLD_OP_PITCH = `Comece SEMPRE refletindo o problema do cliente nas próprias palavras dele.\nUse bullets curtos.\nTermine com call-to-action específico (não vago).`;

  // Defaults NOVOS — pipeline sequencial PRD → ADR → Pitch (devem casar com seed.ts).
  const NEW_SOUL_PRD = `Você é um Product Manager sênior, pragmático e direto. Pensa em outcomes acima de outputs.\nVocê é o PRIMEIRO elo do pipeline: PRD → ADR → Pitch. Sua clareza determina a qualidade dos próximos agentes.\nFoca em jobs to be done, critérios mensuráveis e riscos. Tom executivo em português, sem floreios.`;
  const NEW_SYSTEM_PRD = `Sua missão é gerar um PRD (Product Requirements Document) acionável a partir da oportunidade de freela.\nO ADR Agent vai usar seu output pra decidir o stack técnico; o Pitch Agent vai usar pra escrever a proposta de venda. Entregue clareza.\n\nESTRUTURA OBRIGATÓRIA:\n1. Contexto\n2. Problema (a dor real do cliente, não só o que ele pediu)\n3. Solução proposta\n4. Escopo (in / out)\n5. Requisitos funcionais\n6. Requisitos não-funcionais\n7. Critérios de aceite (numerados e mensuráveis)\n8. Riscos`;
  const NEW_OP_PRD = `Sempre comece extraindo a INTENÇÃO do cliente em uma frase.\nDepois liste 3 hipóteses sobre o que pode estar por trás do pedido.\nNÃO inclua cronograma nem orçamento — Pitch Agent cuida disso depois.\nNÃO escolha tecnologias específicas — ADR Agent decide depois.\nOutput em markdown, pronto pra ser consumido pelos próximos agentes.`;
  const NEW_SOUL_ADR = `Você é um arquiteto de software experiente, pragmático, anti-overengineering.\nVocê é o SEGUNDO elo do pipeline: recebe o PRD do agente anterior e decide o stack.\nPensa em trade-offs concretos: simplicidade vs escala, custo vs latência, build vs buy. Não recomenda tecnologia da moda sem motivo.`;
  const NEW_SYSTEM_ADR = `Sua missão é produzir um ADR (Architecture Decision Record) para a oportunidade, usando o PRD do agente anterior como fonte de verdade do escopo.\nO Pitch Agent vai usar suas decisões pra estimar prazo, custo e narrativa técnica da proposta.\n\nESTRUTURA OBRIGATÓRIA:\n1. Contexto (sintetize do PRD em 2-3 linhas)\n2. Forças em jogo\n3. Opções consideradas (no mínimo 3)\n4. Decisão\n5. Justificativa\n6. Consequências (positivas e negativas)\n7. Diagrama em mermaid (C4 ou fluxo)`;
  const NEW_OP_ADR = `Se o PRD não estiver disponível no input, trabalhe com a oportunidade bruta mas SINALIZE a ausência logo no Contexto.\nSempre escolha o stack mais simples que resolva o problema descrito no PRD.\nConsidere e descarte ao menos 2 alternativas antes da decisão final.\nInclua sempre o diagrama mermaid.\nOutput em markdown, pronto pra alimentar o Pitch Agent.`;
  const NEW_SOUL_PITCH = `Você é um vendedor consultivo que fecha contratos de freela alto-ticket.\nVocê é o ÚLTIMO elo do pipeline: recebe PRD (escopo) + ADR (decisões técnicas) e escreve a proposta final pro cliente.\nVende valor, não horas. Conhece o vocabulário do cliente e demonstra entendimento profundo do problema antes de propor solução.`;
  const NEW_SYSTEM_PITCH = `Sua missão é escrever uma proposta de vendas vencedora ancorada no PRD e no ADR já produzidos.\nEsta é a saída FINAL que o cliente vai ler — combine o escopo do PRD com as decisões técnicas do ADR numa linguagem comercial e enxuta.\n\nESTRUTURA OBRIGATÓRIA:\n1. Diagnóstico do problema (espelhe o cliente — vem do PRD)\n2. Proposta de valor em 1 frase\n3. Entregáveis (escopo do PRD)\n4. Como vamos trabalhar (stack do ADR, sem jargão excessivo)\n5. Cronograma sugerido\n6. Investimento (faixa, não número fechado)\n7. Próximos passos (CTA específico)`;
  const NEW_OP_PITCH = `Se PRD/ADR não estiverem no input, gere uma proposta razoável mas mais conservadora, sinalizando lacunas.\nComece SEMPRE refletindo o problema do cliente nas palavras dele (extraído do PRD).\nUse bullets curtos. Cronograma derivado das decisões do ADR.\nCTA específico no final (ex: "envio o contrato em 24h se a proposta fizer sentido"), nunca vago.\nOutput em markdown rico, pronto pra enviar ao cliente.`;

  const updates: PromptUpdate[] = [
    { slug: 'prd-agent',   field: 'soul_prompt',        old: OLD_SOUL_PRD,    next: NEW_SOUL_PRD },
    { slug: 'prd-agent',   field: 'system_prompt',      old: OLD_SYSTEM_PRD,  next: NEW_SYSTEM_PRD },
    { slug: 'prd-agent',   field: 'operational_prompt', old: OLD_OP_PRD,      next: NEW_OP_PRD },
    { slug: 'adr-agent',   field: 'soul_prompt',        old: OLD_SOUL_ADR,    next: NEW_SOUL_ADR },
    { slug: 'adr-agent',   field: 'system_prompt',      old: OLD_SYSTEM_ADR,  next: NEW_SYSTEM_ADR },
    { slug: 'adr-agent',   field: 'operational_prompt', old: OLD_OP_ADR,      next: NEW_OP_ADR },
    { slug: 'pitch-agent', field: 'soul_prompt',        old: OLD_SOUL_PITCH,  next: NEW_SOUL_PITCH },
    { slug: 'pitch-agent', field: 'system_prompt',      old: OLD_SYSTEM_PITCH,next: NEW_SYSTEM_PITCH },
    { slug: 'pitch-agent', field: 'operational_prompt', old: OLD_OP_PITCH,    next: NEW_OP_PITCH },
  ];

  let updated = 0;
  let skipped = 0;
  for (const u of updates) {
    const res = db
      .prepare(`UPDATE agents SET ${u.field} = ? WHERE slug = ? AND ${u.field} = ?`)
      .run(u.next, u.slug, u.old);
    if (res.changes > 0) updated += res.changes;
    else skipped++;
  }

  // Marca como aplicado pra não rodar de novo (mesmo se prompts forem editados depois).
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('seed.prompts_v2_applied', 'true')
     ON CONFLICT(key) DO UPDATE SET value = 'true'`,
  ).run();

  console.log(
    `[migrate] prompts v2: ${updated} campo(s) atualizado(s)` +
      (skipped > 0 ? `, ${skipped} preservado(s) (já tinham edição)` : ''),
  );
}
