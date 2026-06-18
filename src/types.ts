export interface Agent {
  id: number;
  name: string;
  slug: string;
  description: string;
  soul_prompt: string;
  system_prompt: string;
  operational_prompt: string;
  output_format: string;
  effort_level: string;
  autonomy_level: string;
  model: string;
  temperature: number;
  max_tokens: number;
  retries: number;
  timeout_seconds: number;
  runtime_config_json: string;
  color: 'purple' | 'blue' | 'green' | string;
  icon: string;
  enabled: boolean;
  sort_order: number;
  created_at: string | number | Date | null;
  updated_at: string | number | Date | null;
}

export interface AgentTool {
  id: number;
  agent_id: number;
  tool_name: string;
  enabled: boolean;
}

export interface MonitoredSite {
  id: number;
  name: string;
  slug: string;
  url: string;
  status: string;
  last_scan_at: string | number | Date | null;
  opportunity_count: number;
  scan_interval_minutes: number;
}

export interface RadarTag {
  id: number;
  name: string;
  weight: number;
  active: boolean;
}

export interface Opportunity {
  id: number;
  title: string;
  description: string;
  source_site_id: number | null;
  source_url: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  match_score: number;
  status: string;
  detected_tags: string;
  found_at: string | number | Date | null;
}

export interface AgentRun {
  id: number;
  agent_id: number;
  opportunity_id: number | null;
  status: string;
  progress: number;
  current_step: string;
  next_step: string;
  started_at: string | number | Date | null;
  completed_at: string | number | Date | null;
  logs: string;
  error: string | null;
}

export interface ActivityLog {
  id: number;
  type: string;
  title: string;
  description: string;
  metadata_json: string;
  created_at: string | number | Date | null;
}

export interface DailySummary {
  found: number;
  analyzed: number;
  proposals: number;
  conversion: number;
  deltas: { found: number; analyzed: number; proposals: number; conversion: number };
}

export interface AppConfig {
  userName: string;
  dbPath: string;
  workspacePath: string;
  configured: boolean;
}

export interface AgentRunEvent {
  runId: number;
  agentId: number;
  status?: string;
  progress?: number;
  current_step?: string;
  next_step?: string;
  logChunk?: string;
  error?: string;
  outputFilePath?: string;
}
