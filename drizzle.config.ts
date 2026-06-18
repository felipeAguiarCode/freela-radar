import type { Config } from 'drizzle-kit';

export default {
  schema: './electron/db/schema.ts',
  out: './electron/db/migrations',
  dialect: 'sqlite',
} satisfies Config;
