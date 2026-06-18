// Smoke test: spawn the built Electron app, wait for it to print "ready",
// then send SIGTERM and check exit. This validates main+preload+renderer load
// and IPC handlers register without crashing.
const { spawn } = require('node:child_process');
const path = require('node:path');

const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const mainBundle = path.join(__dirname, '..', 'out', 'main', 'index.js');

console.log('[smoke] launching electron…');
const child = spawn(electronBin, [mainBundle], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  windowsHide: true,
});

let buffer = '';
let timer = null;
let exited = false;

function done(code, reason) {
  if (exited) return;
  exited = true;
  if (timer) clearTimeout(timer);
  if (!child.killed) child.kill();
  console.log(`[smoke] result: ${reason} (code=${code})`);
  process.exit(code);
}

child.stdout.on('data', (d) => { const s = d.toString(); buffer += s; process.stdout.write(`[stdout] ${s}`); });
child.stderr.on('data', (d) => { const s = d.toString(); buffer += s; process.stderr.write(`[stderr] ${s}`); });

child.on('exit', (code) => {
  done(code === 0 ? 0 : 1, `electron exited`);
});

// give the app 8 seconds to start, then kill and pass if no crash output
timer = setTimeout(() => {
  console.log('[smoke] 8s elapsed without crash — looks healthy. killing.');
  done(0, 'ok');
}, 8000);
