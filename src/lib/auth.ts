import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashPassword, randomSessionId, verifyPassword } from "./password";

const COOKIE_NAME = "kelas_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

interface AdminUserRow {
  id: number;
  username: string;
  password_hash: string;
}

export interface AdminUser {
  id: number;
  username: string;
}

// A syntactically valid hash used to equalise timing for unknown usernames.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  const result = await db.query<{ n: string | number }>("SELECT COUNT(*) AS n FROM admin_users");
  return Number(result.rows[0]?.n ?? 0);
}

export async function createAdmin(username: string, password: string): Promise<AdminUser> {
  const db = await getDb();
  const passwordHash = await hashPassword(password);
  const created = await db.query<{ id: number; username: string }>(
    `INSERT INTO admin_users (username, password_hash, created_at)
     VALUES ($1, $2, $3)
     RETURNING id, username`,
    [username, passwordHash, new Date().toISOString()],
  );

  const row = created.rows[0];
  if (!row) throw new Error("Gagal membuat akun admin");
  return { id: row.id, username: row.username };
}

export async function authenticate(
  username: string,
  password: string,
): Promise<AdminUser | null> {
  const db = await getDb();
  const result = await db.query<AdminUserRow>("SELECT * FROM admin_users WHERE username = $1", [
    username,
  ]);
  const row = result.rows[0];

  // Always run a hash comparison so timing does not reveal missing users.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;

  return { id: row.id, username: row.username };
}

export async function createSession(userId: number): Promise<string> {
  const db = await getDb();
  const id = randomSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  await db.query(
    "INSERT INTO admin_sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)",
    [id, userId, expires.toISOString(), now.toISOString()],
  );

  const store = await cookies();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return id;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;

  if (id) {
    const db = await getDb();
    await db.query("DELETE FROM admin_sessions WHERE id = $1", [id]);
  }
  store.delete(COOKIE_NAME);
}

/** Load the signed-in admin from the session cookie, or null. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;
  if (!id) return null;

  const db = await getDb();
  const now = new Date().toISOString();

  await db.query("DELETE FROM admin_sessions WHERE expires_at <= $1", [now]);

  const result = await db.query<{ id: number; username: string }>(
    `SELECT u.id, u.username
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > $2`,
    [id, now],
  );

  return result.rows[0] ?? null;
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new UnauthorizedError();
  return admin;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Tidak diizinkan");
    this.name = "UnauthorizedError";
  }
}
