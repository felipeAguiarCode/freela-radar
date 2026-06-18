const path = require('node:path');
const Database = require('better-sqlite3');
const dbPath = path.join(process.env.APPDATA, 'Electron', 'freela-radar.db');
const db = new Database(dbPath, { readonly: true });
console.log('All runs:');
for (const r of db.prepare('SELECT id, agent_id, opportunity_id, status, progress, current_step, next_step FROM agent_runs').all()) {
  console.log(JSON.stringify(r));
}
console.log('Agent tools sample:');
for (const t of db.prepare('SELECT * FROM agent_tools LIMIT 5').all()) {
  console.log(JSON.stringify(t));
}
console.log('Settings:');
for (const s of db.prepare('SELECT key, value FROM settings').all()) {
  console.log(`  ${s.key} = ${s.value.slice(0, 60)}`);
}
db.close();
process.exit(0);
