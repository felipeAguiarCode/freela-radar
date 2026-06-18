import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { readAppConfig } from '../services/AppConfig';

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;
let _dbPath: string | null = null;

export function getDbPath(): string {
  if (_dbPath) return _dbPath;
  const configured = readAppConfig().dbPath;
  const dir = path.dirname(configured);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _dbPath = configured;
  return _dbPath;
}

export function getDb() {
  if (_db) return _db;
  const dbPath = getDbPath();
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getRawSqlite() {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
