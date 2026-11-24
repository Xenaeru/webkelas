/**
 * Optional demo data. Creates sample schedules (Jadwal A, Jadwal B, and a small
 * exam schedule), assignments and class settings so the UI is not empty on a
 * fresh install.
 *
 * Usage:
 *   npm run seed                                # local PGlite (.data/pglite)
 *   DATABASE_URL=postgres://... npm run seed     # Supabase / Postgres
 *
 * This is sample data only — replace it via the admin pages.
 */
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SCHEMA } from "../src/lib/db.ts";

const connectionString = process.env.DATABASE_URL;
const dataDir = process.env.PGLITE_DATA_DIR ?? resolve(process.cwd(), ".data", "pglite");

const now = new Date().toISOString();

/** Jadwal A — dipakai minggu 1 dan 2 setiap bulan. */
const planA = {
  1: {
    description: "Membawa buku paket Matematika dan laptop untuk praktik pemrograman.",
    items: [
      ["Upacara Bendera", "07:00", "07:45", ""],
      ["Matematika", "07:45", "09:15", "Ibu Sari Wulandari"],
      ["Bahasa Indonesia", "09:30", "11:00", "Bapak Rudi Hartono"],
      ["Pemrograman Dasar", "12:30", "14:00", "Ibu Dewi Anggraini"],
    ],
  },
  2: {
    description: "Praktik laboratorium dimulai pukul 10.15, jangan lupa membawa flashdisk.",
    items: [
      ["Pendidikan Agama", "07:00", "08:30", "Bapak Ahmad Fauzi"],
      ["Matematika", "08:30", "10:00", "Ibu Sari Wulandari"],
      ["Pemrograman Dasar", "10:15", "11:45", "Ibu Dewi Anggraini"],
    ],
  },
  3: {
    description: "",
    items: [
      ["Bahasa Inggris", "07:00", "08:30", "Ibu Ratna Kusuma"],
      ["PJOK", "08:30", "10:00", "Bapak Hendra"],
      ["Informatika", "10:15", "11:45", "Bapak Yudi Pratama"],
    ],
  },
  4: {
    description: "Membawa bahan presentasi kelompok.",
    items: [
      ["Basis Data", "07:00", "09:15", "Bapak Agus Setiawan"],
      ["Pendidikan Pancasila", "09:30", "11:00", "Ibu Maya Sari"],
    ],
  },
  5: {
    description: "Jumat bersih setelah jam pelajaran terakhir.",
    items: [
      ["Projek IPAS", "07:00", "08:30", "Ibu Lestari"],
      ["Seni Budaya", "08:30", "10:00", "Bapak Dedi Kurniawan"],
    ],
  },
};

/**
 * Jadwal B — dipakai minggu 3 dan seterusnya. Sengaja berbeda mata pelajaran
 * dan jamnya supaya terlihat jelas mana yang sedang tampil.
 */
const planB = {
  1: {
    description: "Minggu ke-3 dan seterusnya: praktik pemrograman dimulai lebih pagi.",
    items: [
      ["Upacara Bendera", "07:00", "07:45", ""],
      ["Pemrograman Dasar", "07:45", "09:45", "Ibu Dewi Anggraini"],
      ["Basis Data", "10:00", "12:00", "Bapak Agus Setiawan"],
      ["Matematika", "13:00", "14:30", "Ibu Sari Wulandari"],
    ],
  },
  2: {
    description: "Lab komputer dipakai bergantian dengan kelas lain.",
    items: [
      ["Informatika", "07:00", "09:00", "Bapak Yudi Pratama"],
      ["Pemrograman Dasar", "09:15", "11:15", "Ibu Dewi Anggraini"],
      ["Bahasa Indonesia", "11:15", "12:45", "Bapak Rudi Hartono"],
    ],
  },
  3: {
    description: "",
    items: [
      ["Basis Data", "07:00", "09:00", "Bapak Agus Setiawan"],
      ["Bahasa Inggris", "09:15", "10:45", "Ibu Ratna Kusuma"],
      ["PJOK", "10:45", "12:15", "Bapak Hendra"],
    ],
  },
  4: {
    description: "Bawa berkas proyek untuk review bersama.",
    items: [
      ["Projek IPAS", "07:00", "09:00", "Ibu Lestari"],
      ["Informatika", "09:15", "11:15", "Bapak Yudi Pratama"],
    ],
  },
  5: {
    description: "Pekan produktif: presentasi proyek kelompok.",
    items: [
      ["Pendidikan Pancasila", "07:00", "08:30", "Ibu Maya Sari"],
      ["Seni Budaya", "08:30", "10:00", "Bapak Dedi Kurniawan"],
      ["Pendidikan Agama", "10:15", "11:45", "Bapak Ahmad Fauzi"],
    ],
  },
};

/** Jadwal ujian — hanya tampil saat mode ujian aktif. */
const planExam = {
  1: {
    description: "Bawa alat tulis sendiri. Ponsel dititipkan sebelum ujian dimulai.",
    items: [
      ["Matematika (Ujian)", "07:30", "09:30", "Ibu Sari Wulandari", "Ruang 1", "2026-12-01"],
      ["Bahasa Indonesia (Ujian)", "10:00", "12:00", "Bapak Rudi Hartono", "Ruang 1", "2026-12-01"],
    ],
  },
  2: {
    description: "",
    items: [
      ["Pemrograman Dasar (Ujian)", "07:30", "10:00", "Ibu Dewi Anggraini", "Lab Komputer 1", "2026-12-02"],
    ],
  },
  3: {
    description: "Ujian praktik, bawa laptop masing-masing.",
    items: [
      ["Basis Data (Ujian)", "07:30", "10:00", "Bapak Agus Setiawan", "Lab Komputer 2", "2026-12-03"],
    ],
  },
  4: {
    description: "",
    items: [],
  },
  5: {
    description: "",
    items: [],
  },
};

const plans = { A: planA, B: planB, EXAM: planExam };

const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const assignments = [
  ["Matematika", "Latihan soal bab 2", "Kerjakan seluruh soal latihan pada halaman 20 sampai 25. Tulis langkah pengerjaan secara lengkap.", 1, plusDays(2), "Kumpulkan dalam bentuk PDF", "active"],
  ["Pemrograman Dasar", "Membuat program kalkulator sederhana", "Buat program kalkulator dengan operasi tambah, kurang, kali, dan bagi menggunakan percabangan.", 2, plusDays(5), "Boleh dikerjakan berpasangan", "active"],
  ["Bahasa Indonesia", "Merangkum materi teks eksposisi", "Rangkum materi teks eksposisi minimal dua halaman folio.", 2, plusDays(1), "", "active"],
  ["Informatika", "Presentasi topik literasi digital", "Siapkan slide presentasi maksimal 8 halaman tentang literasi digital.", 3, plusDays(9), "Presentasi di depan kelas", "active"],
  ["Basis Data", "Normalisasi tabel", "Normalisasikan tabel hingga bentuk normal ketiga beserta penjelasannya.", 4, plusDays(-3), "Sudah melewati deadline", "active"],
  ["Bahasa Inggris", "Writing: my daily routine", "Tulis paragraf singkat tentang rutinitas harian dalam bahasa Inggris.", 5, plusDays(-8), "", "completed"],
];

async function writeData(query, exec) {
  await exec(SCHEMA);

  await query("DELETE FROM schedule_items");
  await query("DELETE FROM assignments");

  for (const [version, plan] of Object.entries(plans)) {
    for (const [day, config] of Object.entries(plan)) {
      const res = await query(
        `INSERT INTO daily_schedules (version, day_of_week, description, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version, day_of_week) DO UPDATE SET
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [version, Number(day), config.description, now],
      );
      const dayId = res.rows[0].id;

      for (const [index, [subject, startTime, endTime, teacher, room = "", examDate = null]] of config.items.entries()) {
        await query(
          `INSERT INTO schedule_items
             (daily_schedule_id, subject, start_time, end_time, teacher, room, exam_date,
              sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [dayId, subject, startTime, endTime, teacher, room, examDate, index, now, now],
        );
      }
    }
  }

  // Leave the exam window unset: the sample exam schedule is visible only when
  // an admin turns it on, so the defaults stay in automatic mode.
  await query(
    `INSERT INTO schedule_settings (id, mode, exam_enabled, exam_start_date, exam_end_date, updated_at)
     VALUES (1, 'AUTO', FALSE, NULL, NULL, $1)
     ON CONFLICT (id) DO UPDATE SET
       mode = EXCLUDED.mode,
       exam_enabled = EXCLUDED.exam_enabled,
       exam_start_date = EXCLUDED.exam_start_date,
       exam_end_date = EXCLUDED.exam_end_date,
       updated_at = EXCLUDED.updated_at`,
    [now],
  );

  for (const row of assignments) {
    await query(
      `INSERT INTO assignments
         (subject, title, description, assigned_day, due_date, notes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [...row, now, now],
    );
  }

  await query(
    `INSERT INTO class_settings
       (id, class_name, description, homeroom_teacher, academic_year, announcement, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       class_name = EXCLUDED.class_name,
       description = EXCLUDED.description,
       homeroom_teacher = EXCLUDED.homeroom_teacher,
       academic_year = EXCLUDED.academic_year,
       announcement = EXCLUDED.announcement,
       updated_at = EXCLUDED.updated_at`,
    [
      "X RPL 1",
      "Kelas X RPL 1 adalah kelas jurusan Rekayasa Perangkat Lunak yang berfokus pada pengembangan perangkat lunak, pemrograman, dan pengelolaan basis data.",
      "Ibu Ratna Kusuma, S.Kom.",
      "2026/2027",
      "Ujian Tengah Semester dimulai 1 Desember 2026. Pastikan seluruh tugas tertunggak sudah dikumpulkan sebelum ujian.",
      now,
    ],
  );
}

if (connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  });
  try {
    await writeData(
      (text, params = []) => pool.query(text, params),
      (text) => pool.query(text),
    );
    console.log("Sample data written to Postgres (Supabase).");
  } finally {
    await pool.end();
  }
} else {
  const inMemory = dataDir === "memory://";
  if (!inMemory) mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(inMemory ? undefined : dataDir);
  try {
    await db.exec(SCHEMA);
    await writeData(
      (text, params = []) => db.query(text, params),
      (text) => db.exec(text),
    );
    console.log(
      inMemory ? "Sample data written to in-memory PGlite (not persisted)." : `Sample data written to ${dataDir}`,
    );
  } finally {
    await db.close();
  }
}
