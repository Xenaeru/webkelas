/**
 * Diagnose a DATABASE_URL without leaking the password.
 *
 * Usage:
 *   node scripts/check-db.mjs                       # reads .env.local / .env
 *   $env:DATABASE_URL="postgresql://..."; node scripts/check-db.mjs
 *
 * Checks the URL for the mistakes that actually cause 28P01 / ENOTFOUND on
 * Supabase, then attempts a real connection.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function fromEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) return { value, source: name };
    }
  }
  return null;
}

const fromProcess = process.env.DATABASE_URL?.trim();
const found = fromProcess ? { value: fromProcess, source: "environment" } : fromEnvFile();

if (!found) {
  console.log("DATABASE_URL tidak ditemukan.");
  console.log("Set di .env.local atau environment variable, lalu jalankan ulang.");
  process.exit(1);
}

const raw = found.value;
const redacted = raw.replace(/:\/\/([^:]+):([^@]*)@/, (_, user, pass) => {
  return `://${user}:${"*".repeat(Math.min(pass.length, 12) || 1)}@`;
});

console.log(`Sumber        : ${found.source}`);
console.log(`URL (disensor): ${redacted}`);

const problems = [];

// 1. Placeholder yang belum diganti.
const placeholders = [
  "YOUR-DATABASE-PASSWORD",
  "YOUR-PASSWORD",
  "[YOUR-PASSWORD]",
  "[YOUR-DATABASE-PASSWORD]",
  "<password>",
  "PASSWORD",
];
const passPart = (() => {
  const m = raw.match(/:\/\/([^:]+):([^@]*)@/);
  return m ? m[2] : null;
})();

if (!passPart) {
  problems.push("URL tidak memuat password sama sekali (format harus ://user:password@host).");
} else {
  if (placeholders.some((p) => passPart.toUpperCase() === p.toUpperCase())) {
    problems.push(
      `Password masih placeholder "${passPart}". Ganti dengan password database Supabase yang asli.`,
    );
  }
  if (/%[0-9A-Fa-f]{2}/.test(passPart) === false) {
    const risky = [...new Set(passPart.match(/[@:/?#\[\]]/g) ?? [])];
    if (risky.length > 0) {
      problems.push(
        `Password berisi karakter ${risky.join(" ")} yang harus di-encode ` +
          "(@ -> %40, # -> %23, : -> %3A, / -> %2F, ? -> %3F, [ -> %5B, ] -> %5D).",
      );
    }
  }
}

let parsed = null;
try {
  parsed = new URL(raw);
} catch {
  problems.push("URL tidak bisa di-parse. Pastikan tidak ada spasi atau tanda kutip ikut tersalin.");
}

if (parsed) {
  const user = decodeURIComponent(parsed.username);
  const port = parsed.port || "(default)";
  const host = parsed.hostname;

  console.log(`Host          : ${host}`);
  console.log(`Port          : ${port}`);
  console.log(`User          : ${user}`);
  console.log(`Database      : ${parsed.pathname.replace(/^\//, "") || "(kosong)"}`);

  if (host.includes("pooler.supabase.com")) {
    if (!/^postgres\.[a-z0-9]{16,}$/i.test(user)) {
      problems.push(
        `User harus "postgres.<project-ref>" di pooler Supabase, bukan "${user}". ` +
          "Ambil dari Connect -> Transaction pooler.",
      );
    }
    if (port !== "6543") {
      problems.push(`Port pooler seharusnya 6543, sekarang ${port}.`);
    }
  }

  if (!host.endsWith("supabase.com") && !host.endsWith("supabase.co")) {
    console.log("\nCatatan: host ini bukan Supabase. Kalau mengarah ke database lain, abaikan saran Supabase di atas.");
  }
}

if (problems.length > 0) {
  console.log("\nMasalah terdeteksi:");
  for (const problem of problems) console.log(`  - ${problem}`);
  console.log("\nPerbaiki dulu masalah di atas, lalu jalankan ulang skrip ini.");
  process.exit(1);
}

console.log("\nFormat URL terlihat wajar. Mencoba koneksi...");

const sslFlag = (process.env.DATABASE_SSL ?? "").toLowerCase();
const useSsl = ["false", "disable", "0", "no"].includes(sslFlag)
  ? false
  : { rejectUnauthorized: false };

const pool = new pg.Pool({
  connectionString: raw,
  ssl: useSsl,
  max: 1,
  connectionTimeoutMillis: 15_000,
});

try {
  const version = await pool.query("SELECT version() AS v");
  console.log(`\n✓ Terhubung. ${String(version.rows[0].v).split(" ").slice(0, 2).join(" ")}`);

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const names = tables.rows.map((r) => r.table_name);
  console.log(`  Tabel di schema public: ${names.length ? names.join(", ") : "(kosong — belum dimigrasi)"}`);
  console.log("\nAman untuk dilanjutkan: pakai URL ini sebagai DATABASE_URL di Vercel.");
} catch (error) {
  console.log(`\n✗ Gagal terhubung.`);
  console.log(`  Kode  : ${error.code ?? "(tidak ada)"}`);
  console.log(`  Pesan : ${error.message}`);

  const hints = {
    "28P01": [
      "Password salah. Reset di Supabase -> Project Settings -> Database -> Reset database password,",
      "lalu salin ulang lewat tombol Connect (jangan diketik manual).",
      "Pastikan juga user memakai format postgres.<project-ref>.",
    ],
    ENOTFOUND: [
      "Host tidak ditemukan. Coba ganti aws-0-<region> menjadi aws-1-<region>,",
      "atau salin ulang dari Connect -> Transaction pooler.",
    ],
    ETIMEDOUT: [
      "Koneksi timeout. Pastikan port 6543 (pooler), bukan 5432,",
      "dan jaringan tidak memblokir port tersebut.",
    ],
    "3D000": ["Database tujuan tidak ada. Untuk Supabase gunakan nama database 'postgres'."],
    "28000": ["Tidak diizinkan. Cek format user dan apakah project sedang di-pause."],
  };

  const hint = hints[error.code];
  if (hint) {
    console.log("\nSaran:");
    for (const line of hint) console.log(`  ${line}`);
  }
} finally {
  await pool.end();
}
