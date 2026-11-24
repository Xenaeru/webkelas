import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4312;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "kelas-shots-"));
const shots = join(process.cwd(), "screenshots");
mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production", PGLITE_DATA_DIR: join(dataDir, "pglite") },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (c) => (output += c));
server.stderr.on("data", (c) => (output += c));

const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start\n" + output);
};

async function seed() {
  const setup = await fetch(`${BASE}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "demo-password-2026" }),
  });
  const cookie = (setup.headers.get("set-cookie") ?? "").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  const days = [
    ["Matematika", "07:00", "08:30", "Ibu Sari Wulandari"],
    ["Bahasa Indonesia", "08:30", "10:00", "Bapak Rudi Hartono"],
    ["Pemrograman Dasar", "10:15", "11:45", "Ibu Dewi Anggraini"],
    ["Informatika", "12:30", "14:00", "Bapak Yudi Pratama"],
  ];
  const tuesday = [
    ["Pendidikan Agama", "07:00", "08:30", "Bapak Ahmad Fauzi"],
    ["Matematika", "08:30", "10:00", "Ibu Sari Wulandari"],
    ["Pemrograman Dasar", "10:15", "11:45", "Ibu Dewi Anggraini"],
  ];
  const wednesday = [
    ["Bahasa Inggris", "07:00", "08:30", "Ibu Ratna Kusuma"],
    ["PJOK", "08:30", "10:00", "Bapak Hendra"],
  ];
  const thursday = [["Basis Data", "07:00", "09:15", "Bapak Agus Setiawan"]];
  const friday = [["Projek IPAS", "07:00", "08:30", "Ibu Lestari"]];

  for (const [day, items] of [
    [1, days],
    [2, tuesday],
    [3, wednesday],
    [4, thursday],
    [5, friday],
  ]) {
    for (const [subject, startTime, endTime, teacher] of items) {
      await fetch(`${BASE}/api/schedules?day=${day}&action=item`, {
        method: "POST",
        headers,
        body: JSON.stringify({ subject, startTime, endTime, teacher }),
      });
    }
  }

  await fetch(`${BASE}/api/schedules?day=1&action=description`, {
    method: "POST",
    headers,
    body: JSON.stringify({ description: "Membawa buku paket Matematika dan laptop untuk praktik pemrograman." }),
  });
  await fetch(`${BASE}/api/schedules?day=2&action=description`, {
    method: "POST",
    headers,
    body: JSON.stringify({ description: "Praktik laboratorium dimulai pukul 10.15, jangan lupa membawa flashdisk." }),
  });

  // Jadwal B: a visibly different week-3 schedule.
  for (const [day, items] of [
    [1, [["Pemrograman Dasar", "07:45", "09:45", "Ibu Dewi Anggraini"], ["Basis Data", "10:00", "12:00", "Bapak Agus Setiawan"]]],
    [2, [["Informatika", "07:00", "09:00", "Bapak Yudi Pratama"]]],
    [3, [["Basis Data", "07:00", "09:00", "Bapak Agus Setiawan"]]],
    [4, [["Projek IPAS", "07:00", "09:00", "Ibu Lestari"]]],
    [5, [["Pendidikan Pancasila", "07:00", "08:30", "Ibu Maya Sari"]]],
  ]) {
    for (const [subject, startTime, endTime, teacher] of items) {
      await fetch(`${BASE}/api/schedules?day=${day}&action=item&version=B`, {
        method: "POST",
        headers,
        body: JSON.stringify({ subject, startTime, endTime, teacher }),
      });
    }
  }

  // Exam schedule with room and date.
  for (const [day, subject, startTime, endTime, teacher, room, examDate] of [
    [1, "Matematika (Ujian)", "07:30", "09:30", "Ibu Sari Wulandari", "Ruang 1", "2026-12-01"],
    [2, "Basis Data (Ujian)", "07:30", "10:00", "Bapak Agus Setiawan", "Lab Komputer 2", "2026-12-02"],
  ]) {
    await fetch(`${BASE}/api/schedules?day=${day}&action=item&version=EXAM`, {
      method: "POST",
      headers,
      body: JSON.stringify({ subject, startTime, endTime, teacher, room, examDate }),
    });
  }

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

  const assignments = [
    ["Matematika", "Latihan soal bab 2", "Kerjakan seluruh soal latihan pada halaman 20 sampai 25. Tulis langkah pengerjaan secara lengkap.", 1, plus(2), "Kumpulkan dalam bentuk PDF", "active"],
    ["Pemrograman Dasar", "Membuat program kalkulator sederhana", "Buat program kalkulator dengan operasi tambah, kurang, kali, dan bagi menggunakan percabangan.", 2, plus(5), "Boleh dikerjakan berpasangan", "active"],
    ["Bahasa Indonesia", "Merangkum materi teks eksposisi", "Rangkum materi teks eksposisi minimal dua halaman folio.", 2, plus(1), "", "active"],
    ["Informatika", "Presentasi topik literasi digital", "Siapkan slide presentasi maksimal 8 halaman tentang literasi digital.", 3, plus(9), "Presentasi di depan kelas", "active"],
    ["Basis Data", "Normalisasi tabel", "Normalisasikan tabel hingga bentuk normal ketiga beserta penjelasannya.", 4, plus(-3), "Sudah lewat deadline", "active"],
    ["Bahasa Inggris", "Writing: my daily routine", "Tulis paragraf singkat tentang rutinitas harian dalam bahasa Inggris.", 5, plus(-8), "", "completed"],
  ];

  for (const [subject, title, description, assignedDay, dueDate, notes, status] of assignments) {
    await fetch(`${BASE}/api/assignments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ subject, title, description, assignedDay, dueDate, notes, status }),
    });
  }

  await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      className: "X RPL 1",
      description: "Kelas X RPL 1 adalah kelas jurusan Rekayasa Perangkat Lunak yang berfokus pada pengembangan perangkat lunak, pemrograman, dan pengelolaan basis data.",
      homeroomTeacher: "Ibu Ratna Kusuma, S.Kom.",
      academicYear: "2026/2027",
      announcement: "Ujian Tengah Semester dimulai 1 Desember 2026. Pastikan seluruh tugas tertunggak sudah dikumpulkan sebelum ujian.",
    }),
  });

  return cookie;
}

try {
  await waitForServer();
  const cookie = await seed();

  const browser = await chromium.launch();

  // Desktop
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await desktop.addCookies([{ name: "kelas_session", value: cookie.split("=")[1], domain: "127.0.0.1", path: "/" }]);
  const dPage = await desktop.newPage();
  const errors = [];
  dPage.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  dPage.on("pageerror", (e) => errors.push(String(e)));

  for (const [name, path] of [
    ["home-desktop", "/"],
    ["jadwal-desktop", "/jadwal"],
    ["admin-dashboard", "/admin"],
    ["admin-jadwal", "/admin/jadwal"],
    ["admin-jadwal-b", "/admin/jadwal?version=B"],
    ["admin-jadwal-exam", "/admin/jadwal?version=EXAM"],
    ["admin-mode-jadwal", "/admin/mode-jadwal"],
    ["admin-tugas", "/admin/tugas"],
    ["admin-pengaturan", "/admin/pengaturan"],
  ]) {
    await dPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await dPage.waitForTimeout(900);
    await dPage.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
    console.log(`shot: ${name}`);
  }

  // Mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mPage = await mobile.newPage();
  for (const [name, path] of [
    ["home-mobile", "/"],
    ["jadwal-mobile", "/jadwal"],
    ["admin-mobile", "/admin"],
  ]) {
    await mPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await mPage.waitForTimeout(700);
    await mPage.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
    console.log(`shot: ${name}`);
  }

  // Overflow check across widths
  const widths = [320, 375, 390, 768, 1024, 1280, 1440];
  for (const path of ["/", "/jadwal", "/admin/jadwal"]) {
    for (const w of widths) {
      await dPage.setViewportSize({ width: w, height: 900 });
      await dPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const overflow = await dPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) console.log(`OVERFLOW ${path} @${w}px: ${overflow}px`);
    }
  }

  // Login page shot (no cookie)
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const aPage = await anon.newPage();
  await aPage.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await aPage.screenshot({ path: join(shots, "admin-login.png"), fullPage: true });
  console.log("shot: admin-login");

  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
} finally {
  server.kill();
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 }); } catch {}
}
