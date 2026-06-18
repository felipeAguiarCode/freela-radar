// Run via electron to use the correct native ABI
const path = require('node:path');
const Database = require('better-sqlite3');
const dbPath = path.join(process.env.APPDATA, 'Electron', 'freela-radar.db');
const db = new Database(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map((t) => t.name).join(', '));
const counts = {};
for (const t of tables) {
  if (t.name.startsWith('sqlite_')) continue;
  const row = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get();
  counts[t.name] = row.n;
}
console.log('Counts:', counts);
console.log('Agents:');
for (const a of db.prepare('SELECT id, name, slug, color FROM agents').all()) console.log('  ', a);
console.log('Sites:');
for (const s of db.prepare('SELECT id, name, status, opportunity_count FROM monitored_sites').all()) console.log('  ', s);
console.log('Opportunities:');
for (const o of db.prepare('SELECT id, title, match_score, source_site_id FROM opportunities').all()) console.log('  ', o);
console.log('Active runs:');
for (const r of db.prepare("SELECT id, agent_id, opportunity_id, status, progress, current_step FROM agent_runs WHERE status='running'").all()) console.log('  ', r);
console.log('Activity:');
for (const a of db.prepare('SELECT id, type, title FROM activity_logs ORDER BY id').all()) console.log('  ', a);
db.close();
process.exit(0);
