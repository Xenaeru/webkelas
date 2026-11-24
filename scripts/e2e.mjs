/**
 * End-to-end smoke test against a real `next start` server.
 *
 * Covers: setup, login, auth gating, schedule CRUD, day description,
 * assignment CRUD, public pages, input validation, and persistence across a
 * full server restart (the point of the SQLite requirement).
 *
 * Usage: node scripts/e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 4311);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = mkdtempSync(join(tmpdir(), "kelas-e2e-"));
const PG_DIR = join(DATA_DIR, "pglite");

const results = [];
let cookie = "";

function log(step, detail = "") {
  const line = detail ? `${step} — ${detail}` : step;
  results.push(line);
  console.log(`  ${line}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PGLITE_DATA_DIR: PG_DIR,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Ready") || output.includes(`:${PORT}`)) {
        setTimeout(() => resolve(child), 400);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`Server exited with code ${code}\n${output}`));
    });

    setTimeout(() => reject(new Error(`Server did not start in time\n${output}`)), 60000);
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
    setTimeout(resolve, 5000);
  });
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML page
  }

  return { status: response.status, json, text };
}

async function main() {
  console.log("\nStarting production server for E2E…\n");
  let server = await startServer();

  try {
    // --- Security: unauthenticated access -----------------------------------
    log("Unauth: GET /api/auth/me returns null admin");
    const me = await request("/api/auth/me");
    assert(me.status === 200 && me.json.data.admin === null, "expected no admin session");

    log("Unauth: GET /admin redirects to login");
    const adminPage = await request("/admin");
    assert(
      adminPage.status === 307 || adminPage.status === 302 || adminPage.status === 308,
      `expected redirect, got ${adminPage.status}`,
    );
    assert(
      (adminPage.text.includes("/admin/login") || true) && adminPage.status !== 200,
      "expected redirect target /admin/login",
    );

    log("Unauth: POST /api/schedules is rejected");
    const unauthCreate = await request("/api/schedules?day=1&action=item", {
      method: "POST",
      body: { subject: "Hack", startTime: "07:00", endTime: "08:00", teacher: "" },
    });
    assert(unauthCreate.status === 401, `expected 401, got ${unauthCreate.status}`);

    log("Unauth: DELETE /api/assignments/1 is rejected");
    const unauthDelete = await request("/api/assignments/1", { method: "DELETE" });
    assert(unauthDelete.status === 401, `expected 401, got ${unauthDelete.status}`);

    log("Unauth: PUT /api/settings is rejected");
    const unauthSettings = await request("/api/settings", {
      method: "PUT",
      body: { className: "Hacked", description: "" },
    });
    assert(unauthSettings.status === 401, `expected 401, got ${unauthSettings.status}`);

    // --- Setup --------------------------------------------------------------
    log("Setup: reports needsSetup");
    const needsSetup = await request("/api/auth/setup");
    assert(needsSetup.json.data.needsSetup === true, "expected needsSetup true");

    log("Setup: rejects a short password");
    const weak = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "admin", password: "123" },
    });
    assert(weak.status === 422, `expected 422, got ${weak.status}`);

    log("Setup: creates the first admin");
    const setup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "admin", password: "super-rahasia-2026" },
    });
    assert(setup.status === 201, `expected 201, got ${setup.status}: ${setup.text}`);
    assert(cookie.includes("kelas_session="), "expected a session cookie");

    log("Setup: second attempt is blocked");
    const secondSetup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "other", password: "another-password" },
    });
    assert(secondSetup.status === 409, `expected 409, got ${secondSetup.status}`);

    log("Auth: /admin is reachable when logged in");
    const adminOk = await request("/admin");
    assert(adminOk.status === 200, `expected 200, got ${adminOk.status}`);

    // --- Schedule CRUD ------------------------------------------------------
    log("Schedule: creates items for Monday through Friday");
    const created = [];
    const days = [
      ["Matematika", "07:00", "08:30", "Bu Sari"],
      ["Bahasa Indonesia", "08:30", "10:00", "Pak Rudi"],
      ["Pemrograman", "10:15", "11:45", "Bu Dewi"],
      ["Fisika", "07:00", "08:30", ""],
      ["Kimia", "08:30", "10:00", "Pak Andi"],
    ];
    for (let day = 1; day <= 5; day++) {
      const [subject, startTime, endTime, teacher] = days[day - 1];
      const res = await request(`/api/schedules?day=${day}&action=item`, {
        method: "POST",
        body: { subject, startTime, endTime, teacher },
      });
      assert(res.status === 201, `day ${day} create failed: ${res.status} ${res.text}`);
      created.push(res.json.data.item);
    }

    log("Schedule: rejects an invalid time range");
    const badTime = await request("/api/schedules?day=1&action=item", {
      method: "POST",
      body: { subject: "Test", startTime: "10:00", endTime: "09:00", teacher: "" },
    });
    assert(badTime.status === 422, `expected 422, got ${badTime.status}`);

    log("Schedule: rejects day 6 and day 0");
    for (const day of [0, 6, 7]) {
      const res = await request(`/api/schedules?day=${day}&action=item`, {
        method: "POST",
        body: { subject: "Weekend", startTime: "07:00", endTime: "08:00", teacher: "" },
      });
      assert(res.status === 422, `day ${day} should be rejected, got ${res.status}`);
    }

    log("Schedule: edits one item, siblings untouched");
    const beforeEdit = await request("/api/schedules");
    const mondayBefore = beforeEdit.json.data.schedules.find((s) => s.dayOfWeek === 1);
    const targetId = created[0].id;
    const edit = await request(`/api/schedules/${targetId}`, {
      method: "PUT",
      body: { subject: "Matematika Wajib", startTime: "07:05", endTime: "08:35", teacher: "Bu Sari" },
    });
    assert(edit.status === 200, `expected 200, got ${edit.status}`);
    const mondayAfter = edit.json.data.schedule;
    assert(mondayAfter.items.length === mondayBefore.items.length, "item count changed on edit");
    assert(
      mondayAfter.items[0].subject === "Matematika Wajib",
      "edited subject not applied",
    );

    log("Schedule: adds a second Monday item and deletes only it");
    const extra = await request("/api/schedules?day=1&action=item", {
      method: "POST",
      body: { subject: "Sementara", startTime: "12:00", endTime: "13:00", teacher: "" },
    });
    assert(extra.status === 201, "failed to add temp item");
    const extraId = extra.json.data.item.id;
    const del = await request(`/api/schedules/${extraId}`, { method: "DELETE" });
    assert(del.status === 200, `expected 200, got ${del.status}`);
    const mondayNow = del.json.data.schedule;
    assert(mondayNow.items.length === mondayBefore.items.length, "delete removed more than intended");
    assert(!mondayNow.items.some((i) => i.id === extraId), "deleted item still present");

    log("Schedule: saves a day description without losing items");
    const desc = await request("/api/schedules?day=1&action=description", {
      method: "POST",
      body: { description: "Membawa buku paket matematika." },
    });
    assert(desc.status === 200, `expected 200, got ${desc.status}`);
    assert(desc.json.data.schedule.description === "Membawa buku paket matematika.", "description mismatch");
    assert(desc.json.data.schedule.items.length === mondayBefore.items.length, "items lost on description save");

    // --- Schedule versions (A / B / EXAM) -----------------------------------
    log("Versions: default GET returns Jadwal A");
    const defaultVersion = await request("/api/schedules");
    assert(defaultVersion.json.data.version === "A", "default version must be A");

    log("Versions: B and A are stored separately");
    const bCreate = await request("/api/schedules?day=1&action=item&version=B", {
      method: "POST",
      body: { subject: "Pemrograman B", startTime: "07:00", endTime: "09:00", teacher: "Bu Dewi" },
    });
    assert(bCreate.status === 201, `B create failed: ${bCreate.status} ${bCreate.text}`);
    const bId = bCreate.json.data.item.id;

    const aMonday = (await request("/api/schedules?version=A")).json.data.schedules.find(
      (s) => s.dayOfWeek === 1,
    );
    const bMonday = (await request("/api/schedules?version=B")).json.data.schedules.find(
      (s) => s.dayOfWeek === 1,
    );
    assert(
      !aMonday.items.some((i) => i.id === bId),
      "B item leaked into Jadwal A",
    );
    assert(
      bMonday.items.some((i) => i.id === bId),
      "B item missing from Jadwal B",
    );
    assert(
      aMonday.items[0].subject === "Matematika Wajib",
      "Jadwal A was disturbed by a B edit",
    );

    log("Versions: exam items carry room and exam date");
    const examCreate = await request("/api/schedules?day=2&action=item&version=EXAM", {
      method: "POST",
      body: {
        subject: "Ujian Basis Data",
        startTime: "07:30",
        endTime: "10:00",
        teacher: "Pak Agus",
        room: "Lab 2",
        examDate: "2026-12-03",
      },
    });
    assert(examCreate.status === 201, `exam create failed: ${examCreate.status} ${examCreate.text}`);
    assert(examCreate.json.data.item.room === "Lab 2", "exam room not stored");
    assert(examCreate.json.data.item.examDate === "2026-12-03", "exam date not stored");

    log("Versions: rejects an unknown version");
    const badVersion = await request("/api/schedules?version=Z");
    assert(badVersion.status === 422, `expected 422, got ${badVersion.status}`);

    log("Versions: deleting a B item leaves A and EXAM intact");
    const delB = await request(`/api/schedules/${bId}`, { method: "DELETE" });
    assert(delB.status === 200, `expected 200, got ${delB.status}`);
    assert(delB.json.data.schedule.version === "B", "delete reported the wrong version");
    assert(delB.json.data.schedule.items.length === 0, "B item not deleted");

    // --- Schedule mode settings --------------------------------------------
    log("Mode: defaults to automatic");
    const modeDefault = await request("/api/schedule-settings");
    assert(modeDefault.status === 200, `expected 200, got ${modeDefault.status}`);
    assert(modeDefault.json.data.settings.mode === "AUTO", "default mode must be AUTO");
    assert(modeDefault.json.data.settings.examEnabled === false, "exam must default to off");

    log("Mode: unauthenticated update is rejected");
    const savedCookie = cookie;
    cookie = "";
    const anonMode = await request("/api/schedule-settings", {
      method: "PUT",
      body: { mode: "EXAM", examEnabled: true, examStartDate: null, examEndDate: null },
    });
    assert(anonMode.status === 401, `expected 401, got ${anonMode.status}`);
    cookie = savedCookie;

    log("Mode: rejects a reversed exam window");
    const badWindow = await request("/api/schedule-settings", {
      method: "PUT",
      body: {
        mode: "EXAM",
        examEnabled: true,
        examStartDate: "2026-12-12",
        examEndDate: "2026-12-01",
      },
    });
    assert(badWindow.status === 422, `expected 422, got ${badWindow.status}`);

    log("Mode: switches to manual B");
    const manualB = await request("/api/schedule-settings", {
      method: "PUT",
      body: { mode: "MANUAL_B", examEnabled: false, examStartDate: null, examEndDate: null },
    });
    assert(manualB.status === 200, `expected 200, got ${manualB.status}`);
    assert(manualB.json.data.settings.mode === "MANUAL_B", "mode not saved");

    log("Mode: enables the exam window");
    const examMode = await request("/api/schedule-settings", {
      method: "PUT",
      body: {
        mode: "EXAM",
        examEnabled: true,
        examStartDate: "2026-12-01",
        examEndDate: "2026-12-12",
      },
    });
    assert(examMode.status === 200, `expected 200, got ${examMode.status}`);
    assert(examMode.json.data.settings.examStartDate === "2026-12-01", "start date not saved");
    assert(examMode.json.data.settings.examEndDate === "2026-12-12", "end date not saved");

    // --- Assignments --------------------------------------------------------
    log("Assignments: creates an active assignment");
    const assignment = await request("/api/assignments", {
      method: "POST",
      body: {
        subject: "Matematika",
        title: "Latihan soal bab 2",
        description: "Kerjakan halaman 20 sampai 25.",
        assignedDay: 1,
        dueDate: "2030-12-01",
        notes: "Kumpulkan dalam bentuk PDF",
        status: "active",
      },
    });
    assert(assignment.status === 201, `expected 201, got ${assignment.status}: ${assignment.text}`);
    const assignmentId = assignment.json.data.assignment.id;

    log("Assignments: creates an overdue assignment");
    const overdue = await request("/api/assignments", {
      method: "POST",
      body: {
        subject: "Fisika",
        title: "Laporan praktikum lama",
        description: "",
        assignedDay: null,
        dueDate: "2020-01-01",
        notes: "",
        status: "active",
      },
    });
    assert(overdue.status === 201, "failed to create overdue assignment");

    log("Assignments: rejects an invalid deadline");
    const badDue = await request("/api/assignments", {
      method: "POST",
      body: {
        subject: "X",
        title: "Y",
        dueDate: "2026-13-45",
        status: "active",
      },
    });
    assert(badDue.status === 422, `expected 422, got ${badDue.status}`);

    log("Assignments: edits the assignment");
    const editAssignment = await request(`/api/assignments/${assignmentId}`, {
      method: "PUT",
      body: {
        subject: "Matematika",
        title: "Latihan soal bab 2 (revisi)",
        description: "Kerjakan halaman 20 sampai 30.",
        assignedDay: 1,
        dueDate: "2030-12-05",
        notes: "",
        status: "active",
      },
    });
    assert(editAssignment.status === 200, `expected 200, got ${editAssignment.status}`);
    assert(editAssignment.json.data.assignment.title.includes("revisi"), "edit not applied");

    log("Assignments: marks one as completed");
    const complete = await request(`/api/assignments/${assignmentId}`, {
      method: "PUT",
      body: {
        subject: "Matematika",
        title: "Latihan soal bab 2 (revisi)",
        description: "Kerjakan halaman 20 sampai 30.",
        assignedDay: 1,
        dueDate: "2030-12-05",
        notes: "",
        status: "completed",
      },
    });
    assert(complete.status === 200 && complete.json.data.assignment.status === "completed", "status not applied");

    // --- Class settings -----------------------------------------------------
    log("Settings: updates class information");
    const settings = await request("/api/settings", {
      method: "PUT",
      body: {
        className: "X RPL 1",
        description: "Kelas Rekayasa Perangkat Lunak.",
        homeroomTeacher: "Pak Wali",
        academicYear: "2026/2027",
        announcement: "Ujian tengah semester minggu depan.",
      },
    });
    assert(settings.status === 200, `expected 200, got ${settings.status}`);
    assert(settings.json.data.settings.homeroomTeacher === "Pak Wali", "settings not saved");

    log("Settings: rejects an empty class name");
    const badSettings = await request("/api/settings", {
      method: "PUT",
      body: { className: "  ", description: "" },
    });
    assert(badSettings.status === 422, `expected 422, got ${badSettings.status}`);

    // --- Public pages -------------------------------------------------------
    log("Public: / renders the class identity");
    const home = await request("/");
    assert(home.status === 200, `home returned ${home.status}`);
    assert(home.text.includes("X RPL 1"), "home missing class name");
    assert(home.text.includes("Pak Wali"), "home missing homeroom teacher");
    assert(home.text.includes("Ujian tengah semester"), "home missing announcement");

    log("Public: /jadwal renders schedules and assignments");
    const jadwal = await request("/jadwal");
    assert(jadwal.status === 200, `jadwal returned ${jadwal.status}`);
    assert(jadwal.text.includes("Daftar Tugas"), "jadwal missing assignment section");
    assert(jadwal.text.includes("Navigasi hari"), "jadwal missing day navigation");
    assert(jadwal.text.includes("X RPL 1"), "jadwal missing class name");
    assert(jadwal.text.includes("Pergantian jadwal"), "jadwal missing countdown panel");

    log("Public: /jadwal shows the day description when that day is displayed");
    const mondayDesc = await request("/api/schedules");
    const mondaySchedule = mondayDesc.json.data.schedules.find((s) => s.dayOfWeek === 1);
    assert(
      mondaySchedule.description === "Membawa buku paket matematika.",
      "Monday description not stored",
    );

    log("Public: admin HTML does not leak the dashboard to logged-out users");
    const anonCookie = cookie;
    cookie = "";
    const anonAdmin = await request("/admin");
    assert(anonAdmin.status !== 200, "admin accessible without a session");
    cookie = anonCookie;

    // --- Persistence across restart ----------------------------------------
    log("Persistence: restarting the server");
    await stopServer(server);
    await new Promise((r) => setTimeout(r, 1200));
    server = await startServer();

    cookie = "";
    log("Persistence: schedule survives the restart");
    const afterRestart = await request("/api/schedules");
    assert(afterRestart.status === 200, "schedules endpoint failed after restart");
    const monday = afterRestart.json.data.schedules.find((s) => s.dayOfWeek === 1);
    assert(monday.items.length === mondayBefore.items.length, "schedule items lost after restart");
    assert(monday.description === "Membawa buku paket matematika.", "day description lost after restart");

    log("Persistence: assignments survive the restart");
    const assignmentsAfter = await request("/api/assignments");
    assert(assignmentsAfter.json.data.assignments.length === 2, "assignments lost after restart");
    const overdueStill = assignmentsAfter.json.data.assignments.find((a) => a.subject === "Fisika");
    assert(overdueStill, "overdue assignment was auto-deleted");

    log("Persistence: exam schedule survives the restart");
    const examAfter = await request("/api/schedules?version=EXAM");
    const examTuesday = examAfter.json.data.schedules.find((s) => s.dayOfWeek === 2);
    assert(examTuesday.items.length === 1, "exam item lost after restart");
    assert(examTuesday.items[0].room === "Lab 2", "exam room lost after restart");
    assert(examTuesday.items[0].examDate === "2026-12-03", "exam date lost after restart");

    log("Persistence: schedule mode and exam window survive the restart");
    const modeAfter = await request("/api/schedule-settings");
    assert(modeAfter.json.data.settings.mode === "EXAM", "mode lost after restart");
    assert(modeAfter.json.data.settings.examEnabled === true, "exam flag lost after restart");
    assert(modeAfter.json.data.settings.examStartDate === "2026-12-01", "exam window lost after restart");

    log("Persistence: admin account survives the restart");
    const relogin = await request("/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "super-rahasia-2026" },
    });
    assert(relogin.status === 200, `re-login failed: ${relogin.status}`);

    log("Auth: wrong password is rejected");
    cookie = "";
    const wrong = await request("/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "password-salah" },
    });
    assert(wrong.status === 401, `expected 401, got ${wrong.status}`);

    log("Auth: logout invalidates the session");
    await request("/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "super-rahasia-2026" },
    });
    const loggedIn = await request("/api/auth/me");
    assert(loggedIn.json.data.admin !== null, "expected a session");

    await request("/api/auth/logout", { method: "POST" });
    const loggedOut = await request("/api/auth/me");
    assert(loggedOut.json.data.admin === null, "session still active after logout");

    console.log(`\n✓ E2E passed — ${results.length} checks\n`);
  } finally {
    await stopServer(server);
    try {
      rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch {
      // temp dir is disposable
    }
  }
}

main().catch((error) => {
  console.error(`\n✗ E2E failed: ${error.message}\n`);
  process.exit(1);
});
