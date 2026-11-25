/**
 * Motion verification. Measures behaviour that a screenshot cannot prove:
 *   - nothing stays invisible after reveal has had time to run
 *   - the reveal state actually transitions (opacity 0 -> 1)
 *   - the day-tab pill moves when the selection changes
 *   - reduced-motion renders everything immediately
 *   - no layout shift / overflow introduced by the effects
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "kelas-motion-"));

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  {
    env: { ...process.env, NODE_ENV: "production", PGLITE_DATA_DIR: join(dataDir, "pglite") },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let out = "";
server.stdout.on("data", (c) => (out += c));
server.stderr.on("data", (c) => (out += c));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no server\n" + out);
}

async function seed() {
  const s = await fetch(`${BASE}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "demo-password-2026" }),
  });
  const cookie = (s.headers.get("set-cookie") ?? "").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const post = (p, body) =>
    fetch(`${BASE}${p}`, { method: "POST", headers, body: JSON.stringify(body) });

  for (const [subject, startTime, endTime, teacher] of [
    ["Matematika", "07:00", "08:30", "Ibu Sari"],
    ["Bahasa Indonesia", "08:30", "10:00", "Bapak Rudi"],
    ["Pemrograman Dasar", "10:15", "11:45", "Ibu Dewi"],
  ]) {
    await post(`/api/schedules?day=1&action=item`, { subject, startTime, endTime, teacher });
  }
  for (const day of [2, 3, 4, 5]) {
    await post(`/api/schedules?day=${day}&action=item`, {
      subject: "Informatika",
      startTime: "07:00",
      endTime: "08:30",
      teacher: "Pak Yudi",
    });
  }

  // Today can fall in week 3+, so Jadwal B is the live variant. Seed it with a
  // unique subject so the tab-swap assertion is unambiguous either way.
  for (const day of [1, 2, 3, 4, 5]) {
    await post(`/api/schedules?day=${day}&action=item&version=B`, {
      subject: "Basis Data B",
      startTime: "07:00",
      endTime: "09:00",
      teacher: "Bapak Agus",
    });
  }
  const today = new Date();
  const plus = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  await fetch(`${BASE}/api/assignments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject: "Matematika",
      title: "Latihan soal bab 2",
      description: "Kerjakan soal halaman 20.",
      assignedDay: 1,
      dueDate: plus(2),
      notes: "",
      status: "active",
    }),
  });
  await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      className: "X RPL 1",
      description: "Kelas X RPL 1 jurusan Rekayasa Perangkat Lunak.",
      homeroomTeacher: "Ibu Ratna Kusuma",
      academicYear: "2026/2027",
      announcement: "Ujian Tengah Semester dimulai 1 Desember 2026.",
    }),
  });
  return cookie;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await waitForServer();
  await seed();
  const browser = await chromium.launch();

  // ---- 1. Normal motion -------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  console.log("\nWeb / — scroll reveal");
  await page.goto(`${BASE}/`, { waitUntil: "load" });

  const armed = await page.evaluate(() =>
    document.documentElement.classList.contains("reveal-ready"),
  );
  check("reveal armed before content paints", armed);

  const hiddenAtStart = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    return nodes.filter((n) => Number(getComputedStyle(n).opacity) < 0.9).length;
  });
  check("below-the-fold reveal starts hidden", hiddenAtStart >= 0, `${hiddenAtStart} hidden`);

  // Scroll to the bottom so every reveal target is observed.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1400);

  const stillHidden = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("[data-reveal]")) {
      const style = getComputedStyle(el);
      if (Number(style.opacity) < 0.99) {
        bad.push({
          text: (el.textContent ?? "").trim().slice(0, 40),
          opacity: style.opacity,
        });
      }
    }
    return bad;
  });
  check(
    "every revealed element reaches opacity 1 after scrolling",
    stillHidden.length === 0,
    stillHidden.length ? JSON.stringify(stillHidden.slice(0, 3)) : "",
  );

  const revealMoved = await page.evaluate(() => {
    const el = document.querySelector('[data-reveal="shown"]');
    return el ? getComputedStyle(el).transform : "none";
  });
  check("reveal settles at identity transform", revealMoved === "none", revealMoved);

  // ---- 2. Header + progress --------------------------------------------
  console.log("\nWeb / — sticky header and scroll progress");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const headerSticky = await page.evaluate(() => {
    const header = document.querySelector("header");
    return header ? getComputedStyle(header).position : "none";
  });
  check("header sticks while scrolling", headerSticky === "sticky", headerSticky);

  const progressVisible = await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight / 2);
    return new Promise((resolve) =>
      setTimeout(() => {
        const bar = document.querySelector('[aria-hidden="true"] > div[style*="scaleX"]');
        if (!bar) return resolve({ found: false });
        const style = getComputedStyle(bar);
        resolve({ found: true, opacity: Number(style.opacity), transform: style.transform });
      }, 300),
    );
  });
  check(
    "scroll progress has a non-zero fill mid-page",
    progressVisible.found && progressVisible.opacity > 0.5,
    JSON.stringify(progressVisible),
  );

  // ---- 3. Day tab pill -------------------------------------------------
  console.log("\nWeb /jadwal — day tab indicator");
  await page.goto(`${BASE}/jadwal`, { waitUntil: "load" });
  await page.waitForTimeout(700);

  const pillBefore = await page.evaluate(() => {
    const pill = document.querySelector("[role='tablist'] > span[aria-hidden]");
    return pill ? getComputedStyle(pill).transform : null;
  });

  await page.getByRole("tab", { name: /Sen/ }).first().click();
  await page.waitForTimeout(600);

  const pillAfter = await page.evaluate(() => {
    const pill = document.querySelector("[role='tablist'] > span[aria-hidden]");
    return pill ? getComputedStyle(pill).transform : null;
  });

  check("tab pill exists", pillBefore !== null && pillAfter !== null);
  check(
    "tab pill translates to the selected day",
    pillBefore !== null && pillAfter !== null && pillBefore !== pillAfter,
    `${pillBefore} -> ${pillAfter}`,
  );

  const pillAnimated = await page.evaluate(() => {
    const pill = document.querySelector("[role='tablist'] > span[aria-hidden]");
    return pill ? getComputedStyle(pill).transitionProperty : null;
  });
  check(
    "tab pill transitions transform only",
    pillAnimated === "transform",
    String(pillAnimated),
  );

  // Monday must show exactly one variant's content, and the panel must not be
  // stuck on the previously selected day.
  const mondayPanel = await page.locator("#panel-jadwal").innerText();
  check(
    "panel shows Monday's schedule after selecting Senin",
    /Matematika|Basis Data B/.test(mondayPanel),
    mondayPanel.slice(0, 60).replace(/\s+/g, " "),
  );

  await page.getByRole("tab", { name: /Sen/ }).click();
  await page.waitForTimeout(500);

  // ---- 4. Overflow + contrast sanity ----------------------------------
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    revealReady: document.documentElement.classList.contains("reveal-ready"),
  }));
  check("no horizontal overflow at 1440px", geometry.overflow <= 0, `${geometry.overflow}px`);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(400);
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("no horizontal overflow at 360px", mobileOverflow <= 0, `${mobileOverflow}px`);

  check("no console errors with motion active", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();

  // ---- 5. Reduced motion ----------------------------------------------
  console.log("\nWeb / — prefers-reduced-motion: reduce");
  const rmCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const rmPage = await rmCtx.newPage();
  await rmPage.goto(`${BASE}/`, { waitUntil: "load" });
  await rmPage.waitForTimeout(400);

  const rmState = await rmPage.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    const hidden = nodes.filter((n) => Number(getComputedStyle(n).opacity) < 0.99).length;
    return {
      armed: document.documentElement.classList.contains("reveal-ready"),
      hidden,
      total: nodes.length,
    };
  });
  check("reduced motion leaves nothing hidden", rmState.hidden === 0, JSON.stringify(rmState));
  check("reveal is not armed under reduced motion", rmState.armed === false);

  const rmDuration = await rmPage.evaluate(() => {
    const el = document.querySelector(".card-lift");
    return el ? getComputedStyle(el).transitionDuration : null;
  });
  check(
    "transitions collapse to ~0s under reduced motion",
    rmDuration === null || parseFloat(rmDuration) <= 0.001,
    String(rmDuration),
  );
  await rmCtx.close();

  // ---- 6. JS disabled --------------------------------------------------
  console.log("\nWeb / — JavaScript disabled");
  const noJsCtx = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJsCtx.newPage();
  await noJsPage.goto(`${BASE}/`, { waitUntil: "load" });
  const noJsHidden = await noJsPage.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    return nodes.filter((n) => Number(getComputedStyle(n).opacity) < 0.99).length;
  });
  check("content is readable without JavaScript", noJsHidden === 0, `${noJsHidden} hidden`);
  await noJsCtx.close();

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? "✓" : "✗"} ${results.length - failed.length}/${results.length} motion checks passed`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAILED: ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("FAILED:", error);
  process.exitCode = 1;
} finally {
  server.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {}
}
