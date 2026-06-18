import { EventEmitter } from 'node:events';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { desc } from 'drizzle-orm';

export interface ActivityEntry {
  type: 'agent_run' | 'opportunity' | 'scan' | 'error' | 'document';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

class ActivityLoggerImpl extends EventEmitter {
  log(entry: ActivityEntry) {
    const db = getDb();
    const row = db
      .insert(schema.activity_logs)
      .values({
        type: entry.type,
        title: entry.title,
        description: entry.description ?? '',
        metadata_json: JSON.stringify(entry.metadata ?? {}),
        created_at: new Date(),
      })
      .returning()
      .get();
    this.emit('activity', row);
    return row;
  }

  recent(limit = 20) {
    const db = getDb();
    return db
      .select()
      .from(schema.activity_logs)
      .orderBy(desc(schema.activity_logs.created_at))
      .limit(limit)
      .all();
  }
}

export const ActivityLogger = new ActivityLoggerImpl();
