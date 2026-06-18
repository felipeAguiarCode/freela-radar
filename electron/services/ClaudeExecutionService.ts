import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export interface ClaudeExecutionOptions {
  prompt: string;
  cliPath?: string;
  flags?: string[];
  model?: string;
  maxTokens?: number;
  timeoutSeconds?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ClaudeExecutionHandle extends EventEmitter {
  pid?: number;
  kill: () => void;
  done: Promise<{ code: number | null; stdout: string; stderr: string }>;
}

function getSettingSync(key: string, fallback: string): string {
  try {
    const db = getDb();
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve o caminho do `claude` CLI. O Electron no Windows frequentemente NÃO
 * herda o PATH completo do shell do usuário, então `spawn('claude', ...)` falha
 * com "não reconhecido como um comando interno". Aqui tentamos os caminhos mais
 * comuns antes de cair pro valor cru (que funciona se estiver no PATH).
 */
function resolveClaudeCli(configured: string): string {
  // Se já é absoluto e existe, usa direto.
  if (configured !== 'claude' && existsSync(configured)) return configured;

  if (process.platform === 'win32') {
    const candidates = [
      join(homedir(), '.local', 'bin', 'claude.exe'),
      join(homedir(), '.local', 'bin', 'claude.cmd'),
      join(process.env.APPDATA ?? '', 'npm', 'claude.cmd'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'claude-code', 'claude.exe'),
    ];
    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }
  }

  return configured;
}

export class ClaudeExecutionService {
  /**
   * Spawn `claude` CLI em modo não-interativo (print mode):
   *   claude -p --dangerously-skip-permissions
   *
   * `-p` (alias de `--print`) faz a CLI ler o prompt de stdin, imprimir
   * a resposta em stdout e encerrar — exatamente o que precisamos pra
   * automatizar agentes.
   *
   * Caminho e flags são configuráveis em settings (`claude.cli_path` e `claude.flags`).
   * Sanitiza valores legados (`--cloud-p` do specs.txt antigo era typo do `-p`).
   */
  static execute(opts: ClaudeExecutionOptions): ClaudeExecutionHandle {
    const cliPath = resolveClaudeCli(opts.cliPath ?? getSettingSync('claude.cli_path', 'claude'));
    const DEFAULT_FLAGS = ['-p', '--dangerously-skip-permissions'];
    let flags = opts.flags;
    if (!flags) {
      const raw = getSettingSync('claude.flags', JSON.stringify(DEFAULT_FLAGS));
      try {
        const parsed = JSON.parse(raw);
        flags = Array.isArray(parsed) ? parsed.map(String) : [...DEFAULT_FLAGS];
      } catch {
        flags = [...DEFAULT_FLAGS];
      }
    }
    // Migração: se o usuário ainda tem `--cloud-p` salvo (legado), troca por `-p`.
    flags = flags.map((f) => (f === '--cloud-p' ? '-p' : f));

    // Passa --model ao CLI. Aceita aliases puros (sonnet, opus, haiku) ou
    // nomes completos (claude-sonnet-4-6). Valores legados como "claude-sonnet"
    // são normalizados para o alias puro.
    if (opts.model && !flags.some((f) => f.startsWith('--model'))) {
      const model = opts.model.replace(/^claude-(?!.*-\d)/, '');
      flags.push('--model', model);
    }

    console.log(`[ClaudeExec] spawn: ${cliPath} ${flags.join(' ')}`);

    const timeoutMs = (opts.timeoutSeconds ?? 300) * 1000;
    const emitter = new EventEmitter() as ClaudeExecutionHandle;

    let stdout = '';
    let stderr = '';
    let child: ChildProcessWithoutNullStreams | null = null;
    let timer: NodeJS.Timeout | null = null;
    let killed = false;

    const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      try {
        child = spawn(cliPath, flags!, {
          cwd: opts.cwd,
          env: { ...process.env, ...(opts.env ?? {}) },
          windowsHide: true,
          shell: process.platform === 'win32', // resolve `claude.cmd` no Windows
        }) as ChildProcessWithoutNullStreams;
        emitter.pid = child.pid;

        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');

        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
          emitter.emit('stdout', chunk);
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
          emitter.emit('stderr', chunk);
        });
        child.on('error', (err) => {
          emitter.emit('error', err);
        });
        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          emitter.emit('exit', code);
          resolve({ code, stdout, stderr });
        });

        // Envia prompt via stdin
        child.stdin.end(opts.prompt);

        timer = setTimeout(() => {
          if (!killed && child && !child.killed) {
            killed = true;
            child.kill('SIGTERM');
            emitter.emit('stderr', `\n[timeout] processo encerrado após ${opts.timeoutSeconds ?? 300}s\n`);
          }
        }, timeoutMs);
      } catch (err) {
        emitter.emit('error', err);
        resolve({ code: -1, stdout, stderr: String(err) });
      }
    });

    emitter.kill = () => {
      killed = true;
      if (child && !child.killed) child.kill('SIGTERM');
      if (timer) clearTimeout(timer);
    };
    emitter.done = done;
    return emitter;
  }
}
