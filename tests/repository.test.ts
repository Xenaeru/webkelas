import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb, databaseDriver } from "@/lib/db";

/**
 * Persistence is the point of these tests, so the suite runs against a real
 * on-disk Postgres directory (PGlite). Closing the connection and reopening it
 * therefore proves the data is genuinely stored, not cached in memory.
 */
let repo: typeof import("@/lib/repository");
let dataDir: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    dataDir = mkdtempSync(join(tmpdir(), "kelas-pg-"));
    process.env.PGLITE_DATA_DIR = dataDir;
  }
  repo = await import("@/lib/repository");
  await repo.listSchedules(); // trigger schema creation
});

beforeEach(async () => {
  const db = await getDb();
  await db.exec("DELETE FROM schedule_items");
  await db.exec("DELETE FROM assignments");
  await db.exec("DELETE FROM admin_sessions");
  await db.exec("DELETE FROM admin_users");
  await db.exec("DELETE FROM daily_schedules");
  await db.exec("DELETE FROM schedule_settings");

  for (const version of ["A", "B", "EXAM"] as const) {
    for (const day of [1, 2, 3, 4, 5]) {
      await db.query(
        `INSERT INTO daily_schedules (version, day_of_week, description, updated_at)
         VALUES ($1, $2, '', $3)
         ON CONFLICT (version, day_of_week) DO NOTHING`,
        [version, day, new Date().toISOString()],
      );
    }
  }
});

afterAll(async () => {
  await closeDb();
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // temp dir is disposable
    }
  }
});

describe("database driver", () => {
  it("runs on Postgres semantics", () => {
    expect(["pglite", "postgres"]).toContain(databaseDriver());
  });
});

describe("schedule items", () => {
  it("creates Monday through Friday schedules", async () => {
    const subjects = ["Matematika", "Bahasa Indonesia", "Pemrograman", "Fisika", "Kimia"];

    for (const [index, subject] of subjects.entries()) {
      await repo.createScheduleItem((index + 1) as 1 | 2 | 3 | 4 | 5, {
        subject,
        startTime: "07:00",
        endTime: "08:30",
        teacher: "",
      });
    }

    const schedules = await repo.listSchedules();
    expect(schedules).toHaveLength(5);
    schedules.forEach((schedule, index) => {
      expect(schedule.dayOfWeek).toBe(index + 1);
      expect(schedule.items[0]?.subject).toBe(subjects[index]);
    });
  });

  it("edits one item without touching its siblings", async () => {
    const day = 1 as const;
    const first = await repo.createScheduleItem(day, {
      subject: "Matematika",
      startTime: "07:00",
      endTime: "08:30",
      teacher: "Bu Sari",
    });
    const second = await repo.createScheduleItem(day, {
      subject: "Pemrograman",
      startTime: "08:30",
      endTime: "10:00",
      teacher: "Pak Budi",
    });

    await repo.updateScheduleItem(first.id, {
      subject: "Matematika Lanjut",
      startTime: "07:15",
      endTime: "08:45",
      teacher: "Bu Sari",
    });

    const items = (await repo.getScheduleForDay(day))?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]?.subject).toBe("Matematika Lanjut");
    expect(items[0]?.startTime).toBe("07:15");
    expect(items[1]?.id).toBe(second.id);
    expect(items[1]?.subject).toBe("Pemrograman");
  });

  it("deletes only the targeted item", async () => {
    const day = 2 as const;
    const a = await repo.createScheduleItem(day, { subject: "A", startTime: "07:00", endTime: "08:00", teacher: "" });
    const b = await repo.createScheduleItem(day, { subject: "B", startTime: "08:00", endTime: "09:00", teacher: "" });
    const c = await repo.createScheduleItem(day, { subject: "C", startTime: "09:00", endTime: "10:00", teacher: "" });

    expect(await repo.deleteScheduleItem(b.id)).not.toBeNull();

    const items = (await repo.getScheduleForDay(day))?.items ?? [];
    expect(items.map((i) => i.subject)).toEqual(["A", "C"]);
    expect(items.map((i) => i.id)).toEqual([a.id, c.id]);
  });

  it("persists a day description without removing items", async () => {
    const day = 3 as const;
    await repo.createScheduleItem(day, { subject: "Fisika", startTime: "07:00", endTime: "08:30", teacher: "" });
    await repo.updateDayDescription(day, "Membawa jas lab.");

    const schedule = await repo.getScheduleForDay(day);
    expect(schedule?.description).toBe("Membawa jas lab.");
    expect(schedule?.items).toHaveLength(1);
  });

  it("keeps data after the connection is closed and reopened", async () => {
    await repo.createScheduleItem(4, {
      subject: "Sejarah",
      startTime: "07:00",
      endTime: "08:30",
      teacher: "Pak Andi",
    });
    await repo.updateDayDescription(4, "Keterangan tersimpan.");

    // Simulate a server restart: drop the connection entirely.
    await closeDb();

    const reopened = await repo.getScheduleForDay(4);
    expect(reopened?.items[0]?.subject).toBe("Sejarah");
    expect(reopened?.description).toBe("Keterangan tersimpan.");
  });

  it("reorders items and persists the new order", async () => {
    const day = 5 as const;
    const a = await repo.createScheduleItem(day, { subject: "A", startTime: "07:00", endTime: "08:00", teacher: "" });
    const b = await repo.createScheduleItem(day, { subject: "B", startTime: "08:00", endTime: "09:00", teacher: "" });
    const c = await repo.createScheduleItem(day, { subject: "C", startTime: "09:00", endTime: "10:00", teacher: "" });

    await repo.reorderScheduleItems(day, [c.id, a.id, b.id]);

    expect((await repo.getScheduleForDay(day))?.items.map((i) => i.subject)).toEqual(["C", "A", "B"]);
  });

  it("refuses to reorder ids belonging to another day", async () => {
    const monday = await repo.createScheduleItem(1, {
      subject: "Senin A",
      startTime: "07:00",
      endTime: "08:00",
      teacher: "",
    });
    await repo.createScheduleItem(2, { subject: "Selasa A", startTime: "07:00", endTime: "08:00", teacher: "" });

    await expect(repo.reorderScheduleItems(2, [monday.id])).rejects.toThrow();
  });
});

describe("schedule versions", () => {
  it("keeps A, B and EXAM completely separate", async () => {
    await repo.createScheduleItem(1, { subject: "Matematika A", startTime: "07:00", endTime: "08:00", teacher: "" }, "A");
    await repo.createScheduleItem(1, { subject: "Matematika B", startTime: "07:00", endTime: "08:00", teacher: "" }, "B");
    await repo.createScheduleItem(
      1,
      {
        subject: "Ujian Matematika",
        startTime: "07:00",
        endTime: "09:00",
        teacher: "",
        room: "Lab 2",
        examDate: "2026-12-01",
      },
      "EXAM",
    );

    expect((await repo.getScheduleForDay(1, "A"))?.items.map((i) => i.subject)).toEqual([
      "Matematika A",
    ]);
    expect((await repo.getScheduleForDay(1, "B"))?.items.map((i) => i.subject)).toEqual([
      "Matematika B",
    ]);

    const exam = await repo.getScheduleForDay(1, "EXAM");
    expect(exam?.items[0]?.room).toBe("Lab 2");
    expect(exam?.items[0]?.examDate).toBe("2026-12-01");

    // Editing one variant must not disturb the others.
    const examItem = exam?.items[0];
    expect(examItem).toBeDefined();
    await repo.updateScheduleItem(examItem!.id, {
      subject: "Ujian Matematika (revisi)",
      startTime: "07:00",
      endTime: "09:30",
      teacher: "",
    });

    expect((await repo.getScheduleForDay(1, "A"))?.items[0]?.subject).toBe("Matematika A");
    expect((await repo.getScheduleForDay(1, "EXAM"))?.items[0]?.subject).toBe(
      "Ujian Matematika (revisi)",
    );
  });

  it("returns all variants from listAllSchedules", async () => {
    await repo.createScheduleItem(2, { subject: "A-Selasa", startTime: "07:00", endTime: "08:00", teacher: "" }, "A");
    await repo.createScheduleItem(2, { subject: "B-Selasa", startTime: "07:00", endTime: "08:00", teacher: "" }, "B");

    const all = await repo.listAllSchedules();
    expect(all.A).toHaveLength(5);
    expect(all.B).toHaveLength(5);
    expect(all.EXAM).toHaveLength(5);
    expect(all.A.find((s) => s.dayOfWeek === 2)?.items[0]?.subject).toBe("A-Selasa");
    expect(all.B.find((s) => s.dayOfWeek === 2)?.items[0]?.subject).toBe("B-Selasa");
  });

  it("deletes an item and reports which variant it came from", async () => {
    const item = await repo.createScheduleItem(
      3,
      { subject: "Ujian Bahasa", startTime: "07:00", endTime: "08:00", teacher: "" },
      "EXAM",
    );

    const location = await repo.deleteScheduleItem(item.id);
    expect(location).toEqual({ version: "EXAM", dayOfWeek: 3 });
    expect((await repo.getScheduleForDay(3, "EXAM"))?.items).toHaveLength(0);
  });

  it("excludes exam entries from class statistics", async () => {
    await repo.createScheduleItem(1, { subject: "Matematika", startTime: "07:00", endTime: "08:00", teacher: "" }, "A");
    await repo.createScheduleItem(
      1,
      { subject: "Ujian Matematika", startTime: "07:00", endTime: "09:00", teacher: "" },
      "EXAM",
    );

    const stats = await repo.getStats("2026-11-24");
    expect(stats.totalScheduleItems).toBe(1);
    expect(stats.totalSubjects).toBe(1);
  });
});

describe("schedule settings", () => {
  it("defaults to automatic mode when no row exists", async () => {
    const settings = await repo.getScheduleSettings();
    expect(settings.mode).toBe("AUTO");
    expect(settings.examEnabled).toBe(false);
    expect(settings.examStartDate).toBeNull();
    expect(settings.examEndDate).toBeNull();
  });

  it("persists mode and exam window, including across a restart", async () => {
    await repo.saveScheduleSettings({
      mode: "EXAM",
      examEnabled: true,
      examStartDate: "2026-12-01",
      examEndDate: "2026-12-12",
    });

    const saved = await repo.getScheduleSettings();
    expect(saved.mode).toBe("EXAM");
    expect(saved.examEnabled).toBe(true);
    expect(saved.examStartDate).toBe("2026-12-01");
    expect(saved.examEndDate).toBe("2026-12-12");

    await closeDb();

    const reopened = await repo.getScheduleSettings();
    expect(reopened.mode).toBe("EXAM");
    expect(reopened.examStartDate).toBe("2026-12-01");
  });

  it("overwrites the single settings row instead of accumulating", async () => {
    await repo.saveScheduleSettings({
      mode: "MANUAL_B",
      examEnabled: false,
      examStartDate: null,
      examEndDate: null,
    });
    await repo.saveScheduleSettings({
      mode: "MANUAL_A",
      examEnabled: false,
      examStartDate: null,
      examEndDate: null,
    });

    const db = await getDb();
    const rows = await db.query<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM schedule_settings",
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
    expect((await repo.getScheduleSettings()).mode).toBe("MANUAL_A");
  });
});

describe("assignments", () => {
  it("creates, updates and deletes an assignment", async () => {
    const created = await repo.createAssignment({
      subject: "Matematika",
      title: "Latihan bab 2",
      description: "Halaman 20-25.",
      assignedDay: 1,
      dueDate: "2026-12-01",
      notes: "",
      status: "active",
    });

    expect(await repo.listAssignments()).toHaveLength(1);

    const updated = await repo.updateAssignment(created.id, {
      subject: "Matematika",
      title: "Latihan bab 2 (revisi)",
      description: "Halaman 20-30.",
      assignedDay: 1,
      dueDate: "2026-12-03",
      notes: "Kumpul PDF",
      status: "active",
    });

    expect(updated?.title).toBe("Latihan bab 2 (revisi)");
    expect(updated?.dueDate).toBe("2026-12-03");

    expect(await repo.deleteAssignment(created.id)).toBe(true);
    expect(await repo.listAssignments()).toHaveLength(0);
  });

  it("returns the due date as a stable YYYY-MM-DD key", async () => {
    const created = await repo.createAssignment({
      subject: "Kimia",
      title: "Uji tanggal",
      description: "",
      assignedDay: null,
      dueDate: "2027-01-05",
      notes: "",
      status: "active",
    });

    expect(created.dueDate).toBe("2027-01-05");
    const fetched = await repo.getAssignment(created.id);
    expect(fetched?.dueDate).toBe("2027-01-05");
  });

  it("keeps overdue assignments instead of deleting them", async () => {
    await repo.createAssignment({
      subject: "Bahasa Indonesia",
      title: "Merangkum materi",
      description: "",
      assignedDay: 2,
      dueDate: "2020-01-01",
      notes: "",
      status: "active",
    });

    const stats = await repo.getStats("2026-11-24");
    expect(stats.totalAssignments).toBe(1);
    expect(stats.overdueAssignments).toBe(1);
    expect(await repo.listAssignments()).toHaveLength(1);
  });

  it("survives a restart", async () => {
    await repo.createAssignment({
      subject: "Pemrograman",
      title: "Membuat program sederhana",
      description: "",
      assignedDay: 3,
      dueDate: "2026-12-10",
      notes: "",
      status: "active",
    });

    await closeDb();

    expect(await repo.listAssignments()).toHaveLength(1);
  });
});

describe("class settings", () => {
  it("saves settings with upsert", async () => {
    await repo.saveClassSettings({
      className: "X RPL 1",
      description: "Deskripsi awal",
      homeroomTeacher: "Pak Guru",
      academicYear: "2026/2027",
      announcement: "Pengumuman pertama",
    });

    expect((await repo.getClassSettings()).className).toBe("X RPL 1");

    await repo.saveClassSettings({
      className: "X RPL 1",
      description: "Deskripsi baru",
      homeroomTeacher: "Bu Guru",
      academicYear: "2026/2027",
      announcement: "",
    });

    const settings = await repo.getClassSettings();
    expect(settings.description).toBe("Deskripsi baru");
    expect(settings.homeroomTeacher).toBe("Bu Guru");
    expect(settings.announcement).toBe("");
  });
});

describe("stats", () => {
  it("counts items, subjects and assignment states", async () => {
    await repo.createScheduleItem(1, { subject: "Matematika", startTime: "07:00", endTime: "08:00", teacher: "" });
    await repo.createScheduleItem(2, { subject: "Matematika", startTime: "07:00", endTime: "08:00", teacher: "" });
    await repo.createScheduleItem(2, { subject: "Fisika", startTime: "08:00", endTime: "09:00", teacher: "" });

    await repo.createAssignment({
      subject: "Fisika",
      title: "Tugas 1",
      description: "",
      assignedDay: null,
      dueDate: "2020-01-01",
      notes: "",
      status: "active",
    });
    await repo.createAssignment({
      subject: "Fisika",
      title: "Tugas 2",
      description: "",
      assignedDay: null,
      dueDate: "2030-01-01",
      notes: "",
      status: "completed",
    });

    const stats = await repo.getStats("2026-11-24");
    expect(stats.totalScheduleItems).toBe(3);
    expect(stats.totalSubjects).toBe(2);
    expect(stats.daysWithSchedule).toBe(2);
    expect(stats.totalAssignments).toBe(2);
    expect(stats.activeAssignments).toBe(1);
    expect(stats.overdueAssignments).toBe(1);
    expect(stats.completedAssignments).toBe(1);
  });
});
