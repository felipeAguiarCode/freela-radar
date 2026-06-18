// Gera um contact sheet de robôs (dicebear bottts) com seeds variadas pra escolher
// o melhor pro ícone do app. Saída: assets/_candidates.png (temporário).
import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const SEEDS = [
  'freela-radar', 'radar-bot', 'freela', 'agente-ia', 'orbit', 'nova',
  'pixel', 'circuit', 'spark', 'atlas', 'echo', 'lumen',
  'quartz', 'vega', 'helio', 'cobalt', 'mint-bot', 'sol',
];

const cell = (seed) => {
  const svg = createAvatar(bottts, { seed, size: 256 }).toString();
  return `<div class="cell"><div class="badge"><div class="robot">${svg}</div></div><span>${seed}</span></div>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:Segoe UI,sans-serif}
  body{background:#fff;padding:20px}
  .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px}
  .badge{width:128px;height:128px;border-radius:28px;overflow:hidden;
    background:linear-gradient(145deg,#8b6cff 0%,#6d4aff 55%,#5a36e6 100%);
    display:flex;align-items:center;justify-content:center}
  .robot{width:74%;height:74%}
  .robot svg{width:100%;height:100%;display:block}
  span{font-size:12px;color:#444}
</style></head><body><div class="grid">${SEEDS.map(cell).join('')}</div></body></html>`;

async function launchBrowser() {
  for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await chromium.launch(opts); } catch { /* try next */ }
  }
  throw new Error('nenhum chromium disponível');
}
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 560 } });
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.locator('.grid').screenshot({ type: 'png' });
  writeFileSync(join(assetsDir, '_candidates.png'), buf);
  console.log('✓ assets/_candidates.png');
} finally {
  await browser.close();
}
