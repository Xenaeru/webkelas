/**
 * Interaction test: drives the real UI like a user — clicking day tabs,
 * adding/editing/deleting through forms, and faking the clock across 19:00.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4314;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "kelas-ui-"));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production", PGLITE_DATA_DIR: join(dataDir, "pglite") },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
server.stdout.on("data", (c) => (out += c));
server.stderr.on("data", (c) => (out += c));

const checks = [];
const check = (name, cond, extra = "") => {
  checks.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? ` — ${extra}` : ""}`);
};

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no server\n" + out);
}

try {
  await waitForServer();

  const s = await fetch(`${BASE}/api/auth/setup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "demo-password-2026" }),
  });
  const cookie = (s.headers.get("set-cookie") ?? "").split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  for (const [day, subject, start, end, teacher] of [
    [1, "Matematika", "07:00", "08:30", "Ibu Sari"],
    [1, "Pemrograman Dasar", "08:30", "10:00", "Ibu Dewi"],
    [2, "Bahasa Indonesia", "07:00", "08:30", "Pak Rudi"],
    [5, "Projek IPAS", "07:00", "08:30", "Ibu Lestari"],
  ]) {
    await fetch(`${BASE}/api/schedules?day=${day}&action=item`, {
      method: "POST", headers, body: JSON.stringify({ subject, startTime: start, endTime: end, teacher }),
    });
  }

  // The public page shows whichever variant the current week resolves to, so
  // Jadwal B needs the same shape of data (different teachers) for the public
  // assertions to hold in any week of the month.
  for (const [day, subject, start, end, teacher] of [
    [1, "Matematika", "07:00", "08:30", "Ibu Sari (B)"],
    [1, "Pemrograman Dasar", "08:30", "10:00", "Ibu Dewi (B)"],
    [2, "Bahasa Indonesia", "07:00", "08:30", "Pak Rudi (B)"],
    [5, "Projek IPAS", "07:00", "08:30", "Ibu Lestari (B)"],
  ]) {
    await fetch(`${BASE}/api/schedules?day=${day}&action=item&version=B`, {
      method: "POST", headers, body: JSON.stringify({ subject, startTime: start, endTime: end, teacher }),
    });
  }
  await fetch(`${BASE}/api/assignments`, {
    method: "POST", headers,
    body: JSON.stringify({
      subject: "Matematika", title: "Latihan bab 2", description: "Halaman 20-25.",
      assignedDay: 1, dueDate: "2030-12-01", notes: "", status: "active",
    }),
  });
  await fetch(`${BASE}/api/settings`, {
    method: "PUT", headers,
    body: JSON.stringify({
      className: "X RPL 1", description: "Kelas RPL.", homeroomTeacher: "Ibu Ratna",
      academicYear: "2026/2027", announcement: "",
    }),
  });

  const browser = await chromium.launch();

  // ---------- Public: day tabs ----------
  console.log("\nPublic /jadwal — manual day tabs");
  const pub = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await pub.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/jadwal`, { waitUntil: "networkidle" });

  const tabs = page.getByRole("tab");
  check("five day tabs exist", (await tabs.count()) === 5);

  await tabs.nth(0).click(); // Monday
  await page.waitForTimeout(350);
  check("Monday shows Matematika", (await page.getByText("Matematika").first().isVisible()));
  check("Monday shows Pemrograman Dasar", await page.getByText("Pemrograman Dasar").first().isVisible());

  await tabs.nth(4).click(); // Friday
  await page.waitForTimeout(350);
  const fridayPanel = page.locator("#panel-jadwal");
  check("Friday shows Projek IPAS", await fridayPanel.getByText("Projek IPAS").first().isVisible());
  check(
    "Friday panel no longer shows Matematika",
    (await fridayPanel.getByText("Matematika").count()) === 0,
  );

  await tabs.nth(2).click(); // Wednesday: empty
  await page.waitForTimeout(350);
  check(
    "empty day shows empty state, not an empty table",
    await page.getByText("Belum ada pelajaran").isVisible(),
  );

  // Countdown ticks
  const firstCountdown = await page.locator("text=/^\\d{2}:\\d{2}:\\d{2}$/").first().textContent();
  await page.waitForTimeout(2100);
  const secondCountdown = await page.locator("text=/^\\d{2}:\\d{2}:\\d{2}$/").first().textContent();
  check("countdown updates without reload", firstCountdown !== secondCountdown, `${firstCountdown} → ${secondCountdown}`);

  // ---------- Public: auto rollover across 19:00 (fake clock) ----------
  console.log("\nPublic /jadwal — automatic 19:00 rollover with a faked clock");
  const rolloverCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const rPage = await rolloverCtx.newPage();

  // Monday 2026-11-23 18:59:50 WIB == 11:59:50 UTC. Install the fake clock
  // before the page scripts run so the hook's first tick uses it.
  await rPage.clock.install({ time: new Date("2026-11-23T11:59:50.000Z") });
  await rPage.goto(`${BASE}/jadwal`, { waitUntil: "networkidle" });
  await rPage.waitForTimeout(500);

  const beforeLabel = await rPage.locator("#panel-jadwal").innerText();
  const beforeHeader = await rPage.locator("main").innerText();
  check(
    "before 19:00 the active day is Senin",
    beforeHeader.includes("Senin") && beforeLabel.includes("Matematika"),
  );

  // Cross the boundary: Monday 19:00:05 WIB.
  await rPage.clock.setFixedTime(new Date("2026-11-23T12:00:05.000Z"));
  await rPage.clock.runFor(2000);
  await rPage.waitForTimeout(600);

  const afterHeader = await rPage.locator("main").innerText();
  check(
    "after 19:00 the displayed day switches to Selasa without reload",
    afterHeader.includes("Selasa"),
  );

  // No reload happened: the document identity survives the switch.
  const sameDocument = await rPage.evaluate(() => {
    const w = /** @type {any} */ (window);
    return w.__docMarker === undefined ? (w.__docMarker = true) : false;
  });
  await rPage.waitForTimeout(1500);
  const stillSame = await rPage.evaluate(() => {
    const w = /** @type {any} */ (window);
    return w.__docMarker === true;
  });
  check("page never reloaded during the switch (same document)", sameDocument && stillSame);

  // ---------- Admin: full CRUD through the UI ----------
  console.log("\nAdmin /admin/jadwal — CRUD through the UI");
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await adminCtx.addCookies([{ name: "kelas_session", value: cookie.split("=")[1], domain: "127.0.0.1", path: "/" }]);
  const aPage = await adminCtx.newPage();
  aPage.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  aPage.on("pageerror", (e) => errors.push(String(e)));

  await aPage.goto(`${BASE}/admin/jadwal`, { waitUntil: "networkidle" });

  // Add a new subject to Monday
  await aPage.getByRole("tab", { name: /Sen/ }).first().click();
  await aPage.locator("#new-subject").fill("Informatika");
  await aPage.locator("#new-teacher").fill("Pak Yudi");
  await aPage.locator("#new-start").fill("10:15");
  await aPage.locator("#new-end").fill("11:45");
  await aPage.getByRole("button", { name: "Tambah pelajaran" }).click();
  await aPage.waitForTimeout(900);
  check("added subject appears in the list", await aPage.getByText("Informatika").first().isVisible());
  check(
    "success toast shown",
    await aPage.locator('[aria-live="polite"]').getByText(/Informatika.*ditambahkan ke hari Senin/).isVisible(),
  );

  // Reload → still there (persisted, not local state)
  await aPage.reload({ waitUntil: "networkidle" });
  await aPage.getByRole("tab", { name: /Sen/ }).first().click();
  await aPage.waitForTimeout(400);
  check("subject survives a page reload", await aPage.getByText("Informatika").first().isVisible());

  // Edit it
  const informatikaRow = aPage.locator("li", { hasText: "Informatika" }).first();
  await informatikaRow.getByRole("button", { name: "Edit" }).click();
  await aPage.waitForTimeout(200);
  const subjectInput = aPage.locator('input[id^="edit-subject-"]').first();
  await subjectInput.fill("Informatika Lanjut");
  await aPage.getByRole("button", { name: "Simpan", exact: true }).click();
  await aPage.waitForTimeout(800);
  check("edited subject shown", await aPage.getByText("Informatika Lanjut").first().isVisible());
  check("sibling subject untouched", await aPage.getByText("Matematika").first().isVisible());

  // Delete it (with confirmation)
  const editedRow = aPage.locator("li", { hasText: "Informatika Lanjut" }).first();
  await editedRow.getByRole("button", { name: "Hapus" }).click();
  await aPage.waitForTimeout(200);
  check("delete asks for confirmation", await aPage.getByText("Hapus pelajaran ini?").isVisible());
  await aPage.getByRole("button", { name: "Ya, hapus" }).click();
  await aPage.waitForTimeout(900);
  const listAfterDelete = await aPage.locator("ol").first().innerText();
  check("deleted subject gone from the list", !listAfterDelete.includes("Informatika Lanjut"));
  check("other subjects remain", listAfterDelete.includes("Matematika"));

  // Day description
  await aPage.locator("#day-description").fill("Membawa laptop untuk praktik.");
  await aPage.getByRole("button", { name: "Simpan keterangan" }).click();
  await aPage.waitForTimeout(800);
  check("description toast shown", await aPage.getByText(/Keterangan hari Senin disimpan/).isVisible());

  // Validation surfaced in the UI (this deliberately triggers a 422).
  const errorsBeforeInvalid = errors.length;
  await aPage.locator("#new-subject").fill("");
  await aPage.locator("#new-start").fill("10:00");
  await aPage.locator("#new-end").fill("09:00");
  await aPage.getByRole("button", { name: "Tambah pelajaran" }).click();
  await aPage.waitForTimeout(700);
  check(
    "invalid time range shows a backend validation message",
    await aPage.getByText(/Jam selesai harus lebih lambat/).first().isVisible(),
  );

  // The only console noise allowed is the network 422 we asked for.
  const unexpectedErrors = errors.filter(
    (message, index) =>
      index < errorsBeforeInvalid || !message.includes("422"),
  );
  check(
    "invalid input produced no unexpected console errors",
    unexpectedErrors.length === 0,
    unexpectedErrors.join(" | ").slice(0, 200),
  );

  // ---------- Admin: schedule variants ----------
  console.log("\nAdmin /admin/jadwal — version tabs are independent");
  await aPage.goto(`${BASE}/admin/jadwal?version=B`, { waitUntil: "networkidle" });
  check(
    "B tab is selected from the URL",
    (await aPage.getByRole("tab", { name: /Jadwal B/ }).first().getAttribute("aria-selected")) === "true",
  );

  await aPage.getByRole("tab", { name: /Sen/ }).first().click();
  await aPage.waitForTimeout(300);
  const bMondayBefore = await aPage.locator("ol").first().innerText();
  check("B tab shows the B variant's own teachers", bMondayBefore.includes("Ibu Sari (B)"));
  check("B tab does not show the A variant's teachers", !bMondayBefore.includes("Ibu Sari\n"));
  await aPage.locator("#new-subject").fill("Basis Data B");
  await aPage.locator("#new-start").fill("07:00");
  await aPage.locator("#new-end").fill("09:00");
  await aPage.getByRole("button", { name: "Tambah pelajaran" }).click();
  await aPage.waitForTimeout(900);
  check("B item appears", await aPage.getByText("Basis Data B").first().isVisible());

  await aPage.getByRole("tab", { name: /Jadwal A/ }).first().click();
  await aPage.waitForURL(/version=A/, { timeout: 5000 }).catch(() => {});
  await aPage.waitForTimeout(900);
  await aPage.getByRole("tab", { name: /Sen/ }).first().click();
  await aPage.waitForTimeout(400);
  const aMondayText = await aPage.locator("main").innerText();
  check("Jadwal A did not receive the B item", !aMondayText.includes("Basis Data B"));
  check("Jadwal A still has its own items", aMondayText.includes("Matematika"));

  // Exam variant exposes the extra fields.
  await aPage.getByRole("tab", { name: /Jadwal Ujian/ }).first().click();
  await aPage.waitForURL(/version=EXAM/, { timeout: 5000 }).catch(() => {});
  await aPage.waitForTimeout(800);
  check("exam variant shows the room field", await aPage.locator("#new-room").isVisible());
  check("exam variant shows the exam date field", await aPage.locator("#new-date").isVisible());

  // ---------- Admin: mode panel ----------
  console.log("\nAdmin /admin/mode-jadwal — mode switching");
  await aPage.goto(`${BASE}/admin/mode-jadwal`, { waitUntil: "networkidle" });
  check("mode page shows the current mode", await aPage.getByText("Mode aktif").isVisible());
  check(
    "automatic mode is preselected",
    (await aPage.getByRole("radio", { name: /Otomatis/ }).first().getAttribute("aria-checked")) === "true",
  );

  await aPage.getByRole("radio", { name: /Manual Jadwal B/ }).first().click();
  await aPage.waitForTimeout(200);
  check("switching mode asks for confirmation", await aPage.getByText(/Ganti mode ke/).isVisible());
  await aPage.getByRole("button", { name: "Ya, ganti mode" }).click();
  await aPage.getByRole("button", { name: "Simpan pengaturan" }).click();
  await aPage.waitForTimeout(1000);
  check(
    "manual B is persisted",
    await aPage.getByText("Pengaturan mode jadwal disimpan").isVisible(),
  );

  await aPage.reload({ waitUntil: "networkidle" });
  check(
    "manual B survives a reload",
    (await aPage.getByRole("radio", { name: /Manual Jadwal B/ }).first().getAttribute("aria-checked")) === "true",
  );

  await aPage.getByRole("radio", { name: /Otomatis/ }).first().click();
  await aPage.getByRole("button", { name: "Ya, ganti mode" }).click();
  await aPage.getByRole("button", { name: "Simpan pengaturan" }).click();
  await aPage.waitForTimeout(1000);

  // ---------- Public: exam mode ----------
  console.log("\nPublic /jadwal — exam mode replaces the regular schedule");
  await fetch(`${BASE}/api/schedules?day=1&action=item&version=EXAM`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject: "Matematika (Ujian)",
      startTime: "07:30",
      endTime: "09:30",
      teacher: "Ibu Sari",
      room: "Lab Komputer 2",
      examDate: "2026-12-01",
    }),
  });
  await fetch(`${BASE}/api/schedule-settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      mode: "EXAM",
      examEnabled: true,
      examStartDate: null,
      examEndDate: null,
    }),
  });

  await page.goto(`${BASE}/jadwal`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const examPanel = page.locator('section[aria-label="Informasi hari aktif"]');
  const examBg = await examPanel.evaluate((el) => getComputedStyle(el).backgroundColor);
  check(
    "exam panel has a real background (no transparent tokens)",
    !/rgba\(0, 0, 0, 0\)|transparent/.test(examBg),
    examBg,
  );
  const examTextHeader = await page.locator("main").innerText();
  check("exam mode label is shown", examTextHeader.includes("JADWAL UJIAN"));

  // The panel opens on the auto-active day; select Senin to read the seeded exam entry.
  await page.getByRole("tab", { name: /Sen/ }).first().click();
  await page.waitForTimeout(400);
  const examText = await page.locator("main").innerText();
  check(
    "exam entry replaces the regular Monday schedule",
    examText.includes("Matematika (Ujian)") && !examText.includes("Pemrograman Dasar"),
  );
  check("exam room is rendered", examText.includes("Lab Komputer 2"));

  // Restore automatic mode so later checks see the normal schedule.
  await fetch(`${BASE}/api/schedule-settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      mode: "AUTO",
      examEnabled: false,
      examStartDate: null,
      examEndDate: null,
    }),
  });

  // ---------- Admin: assignments UI ----------
  console.log("\nAdmin /admin/tugas — assignment CRUD through the UI");
  await aPage.goto(`${BASE}/admin/tugas`, { waitUntil: "networkidle" });
  await aPage.locator("#new-subject").fill("Fisika");
  await aPage.locator("#new-title").fill("Laporan praktikum");
  await aPage.locator("#new-description").fill("Tulis laporan lengkap dengan data pengamatan.");
  await aPage.locator("#new-due").fill("2030-12-10");
  await aPage.getByRole("button", { name: "Tambah tugas" }).click();
  await aPage.waitForTimeout(900);
  check("new assignment appears", await aPage.getByText("Laporan praktikum").first().isVisible());

  const fisikaRow = aPage.locator("li", { hasText: "Laporan praktikum" }).first();
  await fisikaRow.getByRole("button", { name: "Tandai selesai" }).click();
  await aPage.waitForTimeout(800);
  await aPage.getByRole("button", { name: "Selesai", exact: true }).click();
  await aPage.waitForTimeout(400);
  check("completed filter shows the assignment", await aPage.getByText("Laporan praktikum").first().isVisible());

  // ---------- Settings UI ----------
  console.log("\nAdmin /admin/pengaturan — settings through the UI");
  await aPage.goto(`${BASE}/admin/pengaturan`, { waitUntil: "networkidle" });
  await aPage.locator("#homeroomTeacher").fill("Ibu Ratna Kusuma");
  await aPage.getByRole("button", { name: "Simpan pengaturan" }).click();
  await aPage.waitForTimeout(900);
  check("settings saved toast", await aPage.getByText("Informasi kelas disimpan").isVisible());

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("public home reflects the new homeroom teacher", await page.getByText("Ibu Ratna Kusuma").first().isVisible());

  check("no unexpected console errors during the whole run", unexpectedErrors.length === 0, unexpectedErrors.join(" | ").slice(0, 200));

  await browser.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "✓" : "✗"} ${checks.length - failed.length}/${checks.length} UI checks passed\n`);
  if (failed.length) process.exit(1);
} finally {
  server.kill();
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 }); } catch {}
}
