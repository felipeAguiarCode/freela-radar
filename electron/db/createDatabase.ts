import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { applySchema } from './migrate';
import { seedBaseAgents } from './seed';

/**
 * Cria um banco SQLite NOVO e independente do banco em uso, com toda a
 * estrutura da aplicação (tabelas + índices) e os 3 agentes de exemplo
 * (PRD → ADR → Pitch) + settings padrão.
 *
 * Usado pelo botão "Criar" em Settings → Geral. Não toca no banco ativo:
 * abre uma conexão própria no caminho destino, popula e fecha.
 */
export function createDatabase(targetPath: string): string {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Começa do zero — o save dialog já confirmou a sobrescrita, se for o caso.
  for (const f of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }

  const sqlite = new Database(targetPath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    applySchema(sqlite); // todas as tabelas + índices (DDL idempotente)
    seedBaseAgents(drizzle(sqlite, { schema })); // 3 agentes + tools + settings padrão
  } finally {
    sqlite.close();
  }
  return targetPath;
}
