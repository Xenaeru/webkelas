import { resolve } from "node:path";

/**
 * Database access is Postgres in every environment.
 *
 * - Production / Vercel: set `DATABASE_URL` (Supabase connection string) and
 *   the `pg` driver pool is used.
 * - Local dev & tests: when `DATABASE_URL` is absent we fall back to PGlite,
 *   a real Postgres compiled to WASM, persisted in `.data/pglite` (or in
 *   memory for tests). Same SQL, no server to install.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Driver = "postgres" | "pglite";

interface DbHandle {
  driver: Driver;
  client: SqlClient;
  initialized: Promise<void>;
}

declare global {
  var __kelasDb: DbHandle | undefined;
}

export function databaseDriver(): Driver {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

/** Human readable target, safe to log (never includes credentials). */
export function databaseDescription(): string {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return `Postgres (${url.hostname}${url.port ? `:${url.port}` : ""})`;
    } catch {
      return "Postgres";
    }
  }
  return "PGlite lokal (.data/pglite)";
}

function sslConfig(): false | { rejectUnauthorized: boolean } {
  const flag = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (flag === "false" || flag === "disable" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "require" || flag === "1" || flag === "yes") {
    return { rejectUnauthorized: false };
  }
  // Supabase (and most managed Postgres) terminate TLS with a chain Node does
  // not bundle, so verification cannot be enforced without their CA cert.
  if (process.env.DATABASE_URL?.includes("sslmode=")) {
    return { rejectUnauthorized: false };
  }
  return process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false;
}

async function createPostgresClient(): Promise<SqlClient> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
    // Serverless functions handle one request at a time; a tiny pool avoids
    // exhausting Supabase's connection limit across cold starts.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const wrap = (
    runner: {
      query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
    },
    close: () => Promise<void>,
  ): SqlClient => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await runner.query(text, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await runner.query(sql);
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // A pooled client must not be closed by the transaction body.
        const result = await fn(wrap(client, async () => undefined));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // connection already broken
        }
        throw error;
      } finally {
        client.release();
      }
    },
    close,
  });

  return wrap(pool, () => pool.end());
}

async function createPgliteClient(): Promise<SqlClient> {
  const { PGlite } = await import("@electric-sql/pglite");

  const dataDir = process.env.PGLITE_DATA_DIR ?? resolve(process.cwd(), ".data", "pglite");
  const inMemory = dataDir === "memory://";

  // PGlite cannot create nested directories for us.
  if (!inMemory) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }

  const db = await PGlite.create(inMemory ? undefined : dataDir);

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params as unknown[]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      return db.transaction(async (tx) => {
        const wrapped: SqlClient = {
          async query<R>(text: string, params: unknown[] = []) {
            const result = await tx.query<R>(text, params as unknown[]);
            return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
          },
          async exec(sql: string) {
            await tx.exec(sql);
          },
          transaction<R>(inner: (nested: SqlClient) => Promise<R>) {
            return inner(wrapped);
          },
          async close() {
            // No-op: the enclosing transaction owns the connection.
          },
        };
        return fn(wrapped);
      });
    },
    close: () => db.close(),
  };
}

async function initialize(): Promise<DbHandle> {
  const driver = databaseDriver();
  const client = driver === "postgres" ? await createPostgresClient() : await createPgliteClient();
  const handle: DbHandle = { driver, client, initialized: Promise.resolve() };
  handle.initialized = migrate(client);
  await handle.initialized;

  if (process.env.NODE_ENV !== "test") {
    console.log(`[db] connected to ${databaseDescription()}`);
  }
  return handle;
}

function getHandle(): DbHandle {
  if (!globalThis.__kelasDb) {
    // The handle is cached immediately; callers await `initialized` before use.
    const placeholder: DbHandle = {
      driver: databaseDriver(),
      client: null as unknown as SqlClient,
      initialized: Promise.resolve(),
    };
    placeholder.initialized = initialize().then(
      (real) => {
        placeholder.client = real.client;
        placeholder.driver = real.driver;
      },
      (error) => {
        // Never cache a broken connection: the next call retries from scratch.
        delete globalThis.__kelasDb;
        throw error;
      },
    );
    globalThis.__kelasDb = placeholder;
  }
  return globalThis.__kelasDb;
}

/** Await the shared connection (and its migration) before running queries. */
export async function getDb(): Promise<SqlClient> {
  const handle = getHandle();
  await handle.initialized;
  return handle.client;
}

/** Close the connection. Used by tests and scripts. */
export async function closeDb(): Promise<void> {
  const handle = globalThis.__kelasDb;
  delete globalThis.__kelasDb;
  if (!handle) return;
  await handle.initialized.catch(() => undefined);
  const client = handle.client;
  if (client) await client.close();
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS class_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  class_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  homeroom_teacher TEXT NOT NULL DEFAULT '',
  academic_year TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_schedules (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  version TEXT NOT NULL DEFAULT 'A' CHECK (version IN ('A', 'B', 'EXAM')),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT daily_schedules_version_day_key UNIQUE (version, day_of_week)
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  daily_schedule_id INTEGER NOT NULL REFERENCES daily_schedules(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  teacher TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  exam_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_day
  ON schedule_items(daily_schedule_id, sort_order, start_time);

CREATE TABLE IF NOT EXISTS schedule_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'AUTO' CHECK (mode IN ('AUTO', 'EXAM', 'MANUAL_A', 'MANUAL_B')),
  exam_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  exam_start_date DATE,
  exam_end_date DATE,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assigned_day INTEGER CHECK (assigned_day BETWEEN 1 AND 5),
  due_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
`;

async function columnExists(client: SqlClient, table: string, column: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0]?.exists === true;
}

/**
 * Bring a pre-existing database up to the multi-version schema.
 *
 * The original install stored exactly one weekly schedule in
 * `daily_schedules` (one row per weekday). That data becomes **Jadwal A**;
 * rows keep their ids so `schedule_items` foreign keys stay valid. Nothing is
 * dropped or recreated, so no schedule, assignment, or admin account is lost.
 */
async function migrateLegacy(client: SqlClient): Promise<void> {
  if (!(await columnExists(client, "daily_schedules", "version"))) {
    await client.exec(
      "ALTER TABLE daily_schedules ADD COLUMN version TEXT NOT NULL DEFAULT 'A'",
    );
  }

  if (!(await columnExists(client, "schedule_items", "room"))) {
    await client.exec("ALTER TABLE schedule_items ADD COLUMN room TEXT NOT NULL DEFAULT ''");
  }
  if (!(await columnExists(client, "schedule_items", "exam_date"))) {
    await client.exec("ALTER TABLE schedule_items ADD COLUMN exam_date DATE");
  }

  // The old table allowed only one row per weekday. Widen it to one row per
  // (version, weekday) so B and EXAM can coexist with A.
  await client.exec(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'daily_schedules_day_of_week_key'
           AND conrelid = 'daily_schedules'::regclass
      ) THEN
        ALTER TABLE daily_schedules DROP CONSTRAINT daily_schedules_day_of_week_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'daily_schedules_version_day_key'
           AND conrelid = 'daily_schedules'::regclass
      ) THEN
        ALTER TABLE daily_schedules
          ADD CONSTRAINT daily_schedules_version_day_key UNIQUE (version, day_of_week);
      END IF;
    END $$;
  `);
}

/**
 * Apply the schema. Every statement is idempotent, so this is safe to run on
 * every cold start (serverless) as well as locally.
 */
async function migrate(client: SqlClient): Promise<void> {
  await client.exec(SCHEMA);
  await migrateLegacy(client);

  const now = new Date().toISOString();

  // Every version needs its five weekdays. Existing rows are untouched.
  for (const version of ["A", "B", "EXAM"] as const) {
    for (const day of [1, 2, 3, 4, 5]) {
      await client.query(
        `INSERT INTO daily_schedules (version, day_of_week, description, updated_at)
         VALUES ($1, $2, '', $3)
         ON CONFLICT (version, day_of_week) DO NOTHING`,
        [version, day, now],
      );
    }
  }

  await client.query(
    `INSERT INTO schedule_settings (id, mode, exam_enabled, exam_start_date, exam_end_date, updated_at)
     VALUES (1, 'AUTO', FALSE, NULL, NULL, $1)
     ON CONFLICT (id) DO NOTHING`,
    [now],
  );
}
