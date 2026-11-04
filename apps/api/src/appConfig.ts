import { appConfigKeys, appConfigSchema, type AppConfig } from '@coldlink/shared';
import type { Database } from './db/client.js';

const CACHE_TTL_MS = 60_000;

export class AppConfigError extends Error {
  override readonly name = 'AppConfigError';

  constructor(readonly issues: string[]) {
    super(`Invalid app_config:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
  }
}

export interface AppConfigReader {
  /** The validated config, from a cache refreshed at most once every 60 seconds (PRD 5.15). */
  get(): Promise<AppConfig>;
  /** Forgets the cached config, so the next read goes to the database. */
  clear(): void;
}

export interface AppConfigReaderOptions {
  ttlMs?: number;
  now?: () => number;
}

// A missing or malformed value is an error, never a default: business values are not invented in
// code (PRD 0.2).
async function loadAppConfig(db: Database): Promise<AppConfig> {
  const rows = await db.selectFrom('app_config').select(['key', 'value']).execute();
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const missing = appConfigKeys.filter((key) => !(key in values));
  const result = appConfigSchema.safeParse(values);
  if (missing.length === 0 && result.success) return result.data;
  const missingKeys = new Set<unknown>(missing);
  const invalid = result.success
    ? []
    : result.error.issues
        .filter((issue) => !missingKeys.has(issue.path[0]))
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new AppConfigError([...missing.map((key) => `${key}: Missing`), ...invalid]);
}

export function createAppConfigReader(
  db: Database,
  { ttlMs = CACHE_TTL_MS, now = Date.now }: AppConfigReaderOptions = {},
): AppConfigReader {
  let cached: { config: Promise<AppConfig>; loadedAt: number } | undefined;

  return {
    get() {
      if (cached !== undefined && now() - cached.loadedAt < ttlMs) return cached.config;
      const entry = { config: loadAppConfig(db), loadedAt: now() };
      cached = entry;
      // Concurrent reads share one load, but a failed load is not cached.
      void entry.config.catch(() => {
        if (cached === entry) cached = undefined;
      });
      return entry.config;
    },
    clear() {
      cached = undefined;
    },
  };
}
