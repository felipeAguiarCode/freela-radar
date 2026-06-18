import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface AppConfig {
  userName: string;
  dbPath: string;
  workspacePath: string;
  configured: boolean; // true depois que o usuário confirmou o setup inicial
}

const CONFIG_FILENAME = 'freela-radar.config.json';

function configFilePath(): string {
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  return path.join(userData, CONFIG_FILENAME);
}

function defaults(): AppConfig {
  const userData = app.getPath('userData');
  const documents = app.getPath('documents');
  return {
    userName: os.userInfo().username || '',
    dbPath: path.join(userData, 'freela-radar.db'),
    workspacePath: path.join(documents, 'FreelaRadar', 'workspace'),
    configured: false,
  };
}

let _cache: AppConfig | null = null;

export function readAppConfig(): AppConfig {
  if (_cache) return _cache;
  const file = configFilePath();
  if (!fs.existsSync(file)) {
    _cache = defaults();
    writeAppConfig(_cache); // grava defaults pra criar o arquivo
    return _cache;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    _cache = { ...defaults(), ...parsed };
    return _cache;
  } catch {
    _cache = defaults();
    return _cache;
  }
}

export function writeAppConfig(next: AppConfig): AppConfig {
  const file = configFilePath();
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8');
  _cache = next;
  return next;
}

export function updateAppConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readAppConfig();
  const next = { ...current, ...patch };
  return writeAppConfig(next);
}

export function ensureWorkspaceExists(workspacePath: string) {
  try {
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
  } catch {
    /* ignore */
  }
}
