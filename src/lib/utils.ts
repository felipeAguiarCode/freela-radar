export function cn(...args: Array<string | false | null | undefined | Record<string, boolean>>): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string') {
      out.push(a);
    } else if (typeof a === 'object') {
      for (const [k, v] of Object.entries(a)) if (v) out.push(k);
    }
  }
  return out.join(' ');
}

export function formatBudgetBRL(min?: number | null, max?: number | null, currency = 'BRL') {
  if (min == null && max == null) return '—';
  const fmt = (v: number) => {
    if (currency === 'USD') return `$ ${v.toLocaleString('en-US')}`;
    return `R$ ${v.toLocaleString('pt-BR')}`;
  };
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max).replace(/^R\$\s|^\$\s/, '')}`;
  if (min != null) return `${fmt(min)}+`;
  return fmt(max!);
}

export function relativeTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'agora';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `há ${sec} seg`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const day = Math.floor(hr / 24);
  return `há ${day} d`;
}

/**
 * "27/05/2026 15:30:42" — pt-BR, sempre completo com segundos.
 */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function safeParseJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try { return JSON.parse(input) as T; } catch { return fallback; }
}
