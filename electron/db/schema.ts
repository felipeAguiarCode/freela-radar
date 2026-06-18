import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

// All ids are AUTOINCREMENT integers per specs §19.

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').default(''),
  soul_prompt: text('soul_prompt').default(''),
  system_prompt: text('system_prompt').default(''),
  operational_prompt: text('operational_prompt').default(''),
  output_format: text('output_format').default('markdown'),
  effort_level: text('effort_level').default('medium'), // low | medium | high | maximum
  autonomy_level: text('autonomy_level').default('semi'), // manual | semi | autonomous | full
  model: text('model').default('sonnet'),
  temperature: real('temperature').default(0.3),
  max_tokens: integer('max_tokens').default(12000),
  retries: integer('retries').default(2),
  timeout_seconds: integer('timeout_seconds').default(300),
  runtime_config_json: text('runtime_config_json').default('{}'),
  color: text('color').default('purple'), // ui accent: purple | blue | green
  icon: text('icon').default('FileText'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  sort_order: integer('sort_order').default(0),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const agent_tools = sqliteTable('agent_tools', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agent_id: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  tool_name: text('tool_name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
});

export const monitored_sites = sqliteTable('monitored_sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  url: text('url').notNull(),
  status: text('status').default('active'), // active | paused | error
  last_scan_at: integer('last_scan_at', { mode: 'timestamp' }),
  opportunity_count: integer('opportunity_count').default(0),
  scan_interval_minutes: integer('scan_interval_minutes').default(5),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const radar_tags = sqliteTable('radar_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  weight: real('weight').default(1.0),
  active: integer('active', { mode: 'boolean' }).default(true),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const opportunities = sqliteTable('opportunities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').default(''),
  source_site_id: integer('source_site_id').references(() => monitored_sites.id),
  source_url: text('source_url'),
  budget_min: real('budget_min'),
  budget_max: real('budget_max'),
  currency: text('currency').default('BRL'),
  match_score: integer('match_score').default(0),
  status: text('status').default('new'), // new | analyzed | proposed | archived
  detected_tags: text('detected_tags').default('[]'),
  found_at: integer('found_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const agent_runs = sqliteTable('agent_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agent_id: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  opportunity_id: integer('opportunity_id').references(() => opportunities.id),
  status: text('status').default('queued'), // queued | running | completed | failed | cancelled
  progress: integer('progress').default(0),
  current_step: text('current_step').default(''),
  next_step: text('next_step').default(''),
  started_at: integer('started_at', { mode: 'timestamp' }),
  completed_at: integer('completed_at', { mode: 'timestamp' }),
  logs: text('logs').default(''),
  error: text('error'),
});

export const agent_artifacts = sqliteTable('agent_artifacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agent_run_id: integer('agent_run_id').notNull().references(() => agent_runs.id, { onDelete: 'cascade' }),
  type: text('type').default('markdown'),
  title: text('title').default(''),
  content: text('content').default(''),
  metadata_json: text('metadata_json').default('{}'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').default(''),
  encrypted: integer('encrypted', { mode: 'boolean' }).default(false),
});

export const activity_logs = sqliteTable('activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // agent_run | opportunity | scan | error | document
  title: text('title').notNull(),
  description: text('description').default(''),
  metadata_json: text('metadata_json').default('{}'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentTool = typeof agent_tools.$inferSelect;
export type MonitoredSite = typeof monitored_sites.$inferSelect;
export type NewMonitoredSite = typeof monitored_sites.$inferInsert;
export type RadarTag = typeof radar_tags.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type AgentRun = typeof agent_runs.$inferSelect;
export type AgentArtifact = typeof agent_artifacts.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type ActivityLog = typeof activity_logs.$inferSelect;
