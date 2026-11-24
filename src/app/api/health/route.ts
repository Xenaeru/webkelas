import { NextResponse } from "next/server";
import { databaseDescription, databaseDriver, getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics. Never returns credentials — only the driver, the
 * redacted target and the database error message, which Vercel otherwise hides
 * behind a generic "Application error" digest.
 */
export async function GET() {
  const info: Record<string, unknown> = {
    driver: databaseDriver(),
    target: databaseDescription(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasSslFlag: Boolean(process.env.DATABASE_SSL),
    poolMax: process.env.DATABASE_POOL_MAX ?? null,
    nodeVersion: process.version,
  };

  try {
    const db = await getDb();
    const result = await db.query<{ now: Date | string }>("SELECT NOW() AS now");
    const counts = await db.query<{
      schedules: string | number;
      items: string | number;
      settings: string | number;
      admins: string | number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM daily_schedules) AS schedules,
         (SELECT COUNT(*) FROM schedule_items) AS items,
         (SELECT COUNT(*) FROM schedule_settings) AS settings,
         (SELECT COUNT(*) FROM admin_users) AS admins`,
    );

    return NextResponse.json({
      data: {
        ...info,
        connected: true,
        serverTime: String(result.rows[0]?.now ?? ""),
        tables: counts.rows[0] ?? null,
      },
    });
  } catch (error) {
    const err = error as { code?: string; message?: string; detail?: string };
    return NextResponse.json(
      {
        data: {
          ...info,
          connected: false,
          errorCode: err?.code ?? null,
          error: err?.message ?? String(error),
          detail: err?.detail ?? null,
        },
      },
      { status: 503 },
    );
  }
}
