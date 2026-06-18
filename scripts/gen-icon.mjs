// Gera o ícone do app no estilo macOS — minimalista, clean, com símbolo de radar
// sobre gradiente roxo suave. Rasteriza via Chromium (playwright) e empacota
// .ico multi-resolução + .png 256 px.
//
// Uso:  node scripts/gen-icon.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
mkdirSync(assetsDir, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Pre-compute radar geometry (in a 100×100 SVG viewBox)
const sweepAngle = -Math.PI * 0.3; // ~54° upper-right
const sweepX = (50 + 40 * Math.cos(sweepAngle)).toFixed(2);
const sweepY = (50 + 40 * Math.sin(sweepAngle)).toFixed(2);

const blipAngle = -Math.PI * 0.38;
const blipX = (50 + 27 * Math.cos(blipAngle)).toFixed(2);
const blipY = (50 + 27 * Math.sin(blipAngle)).toFixed(2);

const html = (px) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
  .icon{
    width:${px}px;height:${px}px;
    border-radius:${Math.round(px * 0.225)}px;
    background:linear-gradient(145deg,#9484FF 0%,#7456FF 45%,#5B3ED6 100%);
    display:flex;align-items:center;justify-content:center;
    position:relative;overflow:hidden;
  }
  .hl{
    position:absolute;inset:0;border-radius:inherit;
    background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.03) 45%,transparent 65%);
    pointer-events:none;
  }
  svg{display:block}
</style></head><body>
<div class="icon">
  <div class="hl"></div>
  <svg width="${Math.round(px * 0.56)}" height="${Math.round(px * 0.56)}" viewBox="0 0 100 100" fill="none">
    <!-- concentric rings -->
    <circle cx="50" cy="50" r="40" stroke="white" stroke-width="2.4" opacity=".2"/>
    <circle cx="50" cy="50" r="27" stroke="white" stroke-width="2.4" opacity=".35"/>
    <circle cx="50" cy="50" r="14" stroke="white" stroke-width="2.4" opacity=".52"/>
    <!-- center dot -->
    <circle cx="50" cy="50" r="4" fill="white" opacity=".92"/>
    <!-- sweep line -->
    <line x1="50" y1="50" x2="${sweepX}" y2="${sweepY}"
          stroke="white" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <!-- blip -->
    <circle cx="${blipX}" cy="${blipY}" r="3.2" fill="white" opacity=".85"/>
  </svg>
</div>
</body></html>`;

async function launchBrowser() {
  const attempts = [{}, { channel: 'msedge' }, { channel: 'chrome' }];
  let lastErr;
  for (const opts of attempts) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const frames = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(size), { waitUntil: 'load' });
    const el = await page.$('.icon');
    const buf = await el.screenshot({ omitBackground: true, type: 'png' });
    frames.push({ size, buf });
    if (size === 256) writeFileSync(join(assetsDir, 'icon.png'), buf);
  }
  writeFileSync(join(assetsDir, 'icon.ico'), buildIco(frames));
  console.log(`✓ assets/icon.ico (${frames.map((f) => f.size).join(',')}) + assets/icon.png`);
} finally {
  await browser.close();
}

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  images.forEach((img, i) => {
    const b = i * 16;
    const dim = img.size >= 256 ? 0 : img.size;
    dir.writeUInt8(dim, b + 0);
    dir.writeUInt8(dim, b + 1);
    dir.writeUInt8(0, b + 2);
    dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(img.buf.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += img.buf.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}
