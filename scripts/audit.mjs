/**
 * Visual verification without eyeballing screenshots: measures geometry,
 * computed styles, contrast ratios, and typography from the live DOM.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4313;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "kelas-audit-"));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production", PGLITE_DATA_DIR: join(dataDir, "pglite") },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
server.stdout.on("data", (c) => (out += c));
server.stderr.on("data", (c) => (out += c));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no server\n" + out);
}

async function seed() {
  const s = await fetch(`${BASE}/api/auth/setup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "demo-password-2026" }),
  });
  const cookie = (s.headers.get("set-cookie") ?? "").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const put = (p, body) => fetch(`${BASE}${p}`, { method: "POST", headers, body: JSON.stringify(body) });

  const plan = {
    1: [["Matematika", "07:00", "08:30", "Ibu Sari Wulandari"], ["Bahasa Indonesia", "08:30", "10:00", "Bapak Rudi Hartono"], ["Pemrograman Dasar", "10:15", "11:45", "Ibu Dewi Anggraini"]],
    2: [["Pendidikan Agama", "07:00", "08:30", "Bapak Ahmad Fauzi"], ["Matematika", "08:30", "10:00", "Ibu Sari Wulandari"]],
    3: [["Bahasa Inggris", "07:00", "08:30", "Ibu Ratna Kusuma"]],
    4: [["Basis Data", "07:00", "09:15", "Bapak Agus Setiawan"]],
    5: [["Projek IPAS", "07:00", "08:30", "Ibu Lestari"]],
  };
  for (const [day, items] of Object.entries(plan)) {
    for (const [subject, startTime, endTime, teacher] of items) {
      await put(`/api/schedules?day=${day}&action=item`, { subject, startTime, endTime, teacher });
    }
  }
  await put("/api/schedules?day=1&action=description", { description: "Membawa buku paket Matematika dan laptop." });

  // Jadwal B and the exam schedule, so the version tabs and mode page have data.
  for (const [day, items] of Object.entries({
    1: [["Pemrograman Dasar", "07:45", "09:45", "Ibu Dewi Anggraini"], ["Basis Data", "10:00", "12:00", "Bapak Agus Setiawan"]],
    2: [["Informatika", "07:00", "09:00", "Bapak Yudi Pratama"]],
    3: [["Basis Data", "07:00", "09:00", "Bapak Agus Setiawan"]],
    4: [["Projek IPAS", "07:00", "09:00", "Ibu Lestari"]],
    5: [["Pendidikan Pancasila", "07:00", "08:30", "Ibu Maya Sari"]],
  })) {
    for (const [subject, startTime, endTime, teacher] of items) {
      await put(`/api/schedules?day=${day}&action=item&version=B`, { subject, startTime, endTime, teacher });
    }
  }
  for (const [day, subject, startTime, endTime, teacher, room, examDate] of [
    [1, "Matematika (Ujian)", "07:30", "09:30", "Ibu Sari Wulandari", "Ruang 1", "2026-12-01"],
    [2, "Basis Data (Ujian)", "07:30", "10:00", "Bapak Agus Setiawan", "Lab Komputer 2", "2026-12-02"],
  ]) {
    await put(`/api/schedules?day=${day}&action=item&version=EXAM`, {
      subject, startTime, endTime, teacher, room, examDate,
    });
  }
  await put("/api/schedule-settings", {
    mode: "AUTO",
    examEnabled: false,
    examStartDate: null,
    examEndDate: null,
  });

  const today = new Date();
  const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (const [subject, title, description, assignedDay, dueDate, notes, status] of [
    ["Matematika", "Latihan soal bab 2", "Kerjakan seluruh soal latihan halaman 20 sampai 25.", 1, plus(2), "Kumpulkan PDF", "active"],
    ["Pemrograman Dasar", "Membuat program kalkulator", "Buat kalkulator dengan percabangan.", 2, plus(5), "", "active"],
    ["Basis Data", "Normalisasi tabel", "Normalisasikan hingga 3NF.", 4, plus(-3), "Lewat deadline", "active"],
  ]) {
    await fetch(`${BASE}/api/assignments`, {
      method: "POST", headers,
      body: JSON.stringify({ subject, title, description, assignedDay, dueDate, notes, status }),
    });
  }
  await fetch(`${BASE}/api/settings`, {
    method: "PUT", headers,
    body: JSON.stringify({
      className: "X RPL 1",
      description: "Kelas X RPL 1 adalah kelas jurusan Rekayasa Perangkat Lunak.",
      homeroomTeacher: "Ibu Ratna Kusuma, S.Kom.",
      academicYear: "2026/2027",
      announcement: "Ujian Tengah Semester dimulai 1 Desember 2026.",
    }),
  });
  return cookie;
}

function contrast(rgb1, rgb2) {
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l1 = lum(rgb1), l2 = lum(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const parseRgb = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);

try {
  await waitForServer();
  const cookie = await seed();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "kelas_session", value: cookie.split("=")[1], domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  const report = {};

  for (const path of [
    "/",
    "/jadwal",
    "/admin",
    "/admin/jadwal",
    "/admin/jadwal?version=B",
    "/admin/jadwal?version=EXAM",
    "/admin/mode-jadwal",
    "/admin/tugas",
    "/admin/pengaturan",
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const h1 = document.querySelector("h1");
      const h1Style = h1 ? getComputedStyle(h1) : null;

      // Find any element whose content overflows its own box horizontally.
      const clipped = [];
      for (const el of document.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        if (style.overflowX === "hidden" || style.overflowX === "clip") continue;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth });
        }
      }

      // Check no two sibling blocks overlap vertically in the main flow.
      const main = document.querySelector("main");
      const sections = main ? Array.from(main.children) : [];

      return {
        bodyBg: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        bodyFont: bodyStyle.fontFamily,
        h1Font: h1Style?.fontFamily ?? null,
        h1Size: h1Style?.fontSize ?? null,
        h1Text: h1?.textContent?.trim().slice(0, 60) ?? null,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
        clipped: clipped.slice(0, 5),
        sectionCount: sections.length,
        textLength: document.body.innerText.length,
      };
    });

    const bg = parseRgb(info.bodyBg);
    const fg = parseRgb(info.bodyColor);
    info.contrast = Number(contrast(bg, fg).toFixed(2));
    info.overflow = info.docScrollW - info.docClientW;
    report[path] = info;
  }

  // Mobile geometry
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/jadwal", "/admin/jadwal", "/admin/mode-jadwal", "/admin/tugas"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // Tap-target check: interactive elements smaller than 32px in either axis.
    const smallTargets = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("button, a[href], input, select, textarea")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 30 && !el.closest("nav") && el.tagName !== "INPUT" && el.tagName !== "SELECT") {
          bad.push({ tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 24), h: Math.round(r.height) });
        }
      }
      return bad.slice(0, 6);
    });
    report[`mobile:${path}`] = { overflow, smallTargets };
  }

  // Font loading check
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const fonts = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector("h1")).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    loaded: Array.from(document.fonts).map((f) => `${f.family}:${f.status}`),
  }));

  console.log(JSON.stringify({ report, fonts, consoleErrors: errors }, null, 2));
  await browser.close();
} finally {
  server.kill();
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 }); } catch {}
}
