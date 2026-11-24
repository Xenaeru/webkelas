import { getDb, type SqlClient } from "./db";
import type { AssignmentInput, ClassSettingsInput, ScheduleItemInput } from "./validation";
import type { ExamConfig, ScheduleMode, ScheduleVersion } from "./schedule-version";

export interface ScheduleItem {
  id: number;
  subject: string;
  startTime: string;
  endTime: string;
  teacher: string;
  /** Exam room. Empty for regular schedules. */
  room: string;
  /** Exam date (`YYYY-MM-DD`). Null for regular schedules. */
  examDate: string | null;
  sortOrder: number;
}

export interface DailySchedule {
  id: number;
  version: ScheduleVersion;
  dayOfWeek: number;
  description: string;
  updatedAt: string;
  items: ScheduleItem[];
}

/**
 * What callers must hand the repository. The API layer always supplies the
 * fully parsed `ScheduleItemInput`, but scripts and tests may omit the exam-only
 * fields, so they stay optional here.
 */
export type ScheduleItemDraft = Omit<ScheduleItemInput, "room" | "examDate"> & {
  room?: string;
  examDate?: string | null;
};

export interface Assignment {
  id: number;
  subject: string;
  title: string;
  description: string;
  assignedDay: number | null;
  dueDate: string;
  notes: string;
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface ClassSettings {
  className: string;
  description: string;
  homeroomTeacher: string;
  academicYear: string;
  announcement: string;
  updatedAt: string;
}

interface ScheduleItemRow {
  id: number;
  daily_schedule_id: number;
  subject: string;
  start_time: string;
  end_time: string;
  teacher: string;
  room: string | null;
  exam_date: string | Date | null;
  sort_order: number;
}

interface DailyScheduleRow {
  id: number;
  version: ScheduleVersion;
  day_of_week: number;
  description: string;
  updated_at: Date | string;
}

interface AssignmentRow {
  id: number;
  subject: string;
  title: string;
  description: string;
  assigned_day: number | null;
  due_date: string | Date;
  notes: string;
  status: "active" | "completed";
  created_at: Date | string;
  updated_at: Date | string;
}

interface ClassSettingsRow {
  class_name: string;
  description: string;
  homeroom_teacher: string;
  academic_year: string;
  announcement: string;
  updated_at: Date | string;
}

/** Postgres returns DATE/TIMESTAMPTZ as Date objects; normalise to strings. */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * A `DATE` column parsed by `pg` becomes a local-midnight Date. Read it back
 * in UTC so the calendar day never shifts across timezones.
 */
function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapItem(row: ScheduleItemRow): ScheduleItem {
  return {
    id: row.id,
    subject: row.subject,
    startTime: row.start_time,
    endTime: row.end_time,
    teacher: row.teacher,
    room: row.room ?? "",
    examDate: row.exam_date === null || row.exam_date === undefined ? null : toDateKey(row.exam_date),
    sortOrder: row.sort_order,
  };
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    description: row.description,
    assignedDay: row.assigned_day,
    dueDate: toDateKey(row.due_date),
    notes: row.notes,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listSchedules(version: ScheduleVersion = "A"): Promise<DailySchedule[]> {
  const db = await getDb();
  const days = await db.query<DailyScheduleRow>(
    "SELECT * FROM daily_schedules WHERE version = $1 ORDER BY day_of_week",
    [version],
  );
  const items = await db.query<ScheduleItemRow>(
    `SELECT i.* FROM schedule_items i
       JOIN daily_schedules d ON d.id = i.daily_schedule_id
      WHERE d.version = $1
      ORDER BY i.sort_order, i.start_time, i.id`,
    [version],
  );

  return days.rows.map((day) => ({
    id: day.id,
    version: day.version,
    dayOfWeek: day.day_of_week,
    description: day.description,
    updatedAt: toIsoString(day.updated_at),
    items: items.rows
      .filter((item) => item.daily_schedule_id === day.id)
      .map(mapItem),
  }));
}

/** Every variant at once, keyed by version — used by the public pages. */
export async function listAllSchedules(): Promise<Record<ScheduleVersion, DailySchedule[]>> {
  const [a, b, exam] = await Promise.all([
    listSchedules("A"),
    listSchedules("B"),
    listSchedules("EXAM"),
  ]);
  return { A: a, B: b, EXAM: exam };
}

export async function getScheduleForDay(
  dayOfWeek: number,
  version: ScheduleVersion = "A",
): Promise<DailySchedule | null> {
  const db = await getDb();
  const day = await db.query<DailyScheduleRow>(
    "SELECT * FROM daily_schedules WHERE day_of_week = $1 AND version = $2",
    [dayOfWeek, version],
  );
  const row = day.rows[0];
  if (!row) return null;

  const items = await db.query<ScheduleItemRow>(
    `SELECT * FROM schedule_items
      WHERE daily_schedule_id = $1
      ORDER BY sort_order, start_time, id`,
    [row.id],
  );

  return {
    id: row.id,
    version: row.version,
    dayOfWeek: row.day_of_week,
    description: row.description,
    updatedAt: toIsoString(row.updated_at),
    items: items.rows.map(mapItem),
  };
}

async function ensureDay(
  db: SqlClient,
  version: ScheduleVersion,
  dayOfWeek: number,
): Promise<number> {
  const existing = await db.query<{ id: number }>(
    "SELECT id FROM daily_schedules WHERE version = $1 AND day_of_week = $2",
    [version, dayOfWeek],
  );
  const found = existing.rows[0];
  if (found) return found.id;

  const created = await db.query<{ id: number }>(
    `INSERT INTO daily_schedules (version, day_of_week, description, updated_at)
     VALUES ($1, $2, '', $3)
     ON CONFLICT (version, day_of_week) DO UPDATE SET description = daily_schedules.description
     RETURNING id`,
    [version, dayOfWeek, new Date().toISOString()],
  );
  const inserted = created.rows[0];
  if (!inserted) throw new Error("Gagal membuat hari jadwal");
  return inserted.id;
}

export async function updateDayDescription(
  dayOfWeek: number,
  description: string,
  version: ScheduleVersion = "A",
): Promise<DailySchedule> {
  const db = await getDb();
  const dayId = await ensureDay(db, version, dayOfWeek);

  await db.query(
    "UPDATE daily_schedules SET description = $1, updated_at = $2 WHERE id = $3",
    [description, new Date().toISOString(), dayId],
  );

  const schedule = await getScheduleForDay(dayOfWeek, version);
  if (!schedule) throw new Error("Gagal menyimpan keterangan hari");
  return schedule;
}

export async function createScheduleItem(
  dayOfWeek: number,
  input: ScheduleItemDraft,
  version: ScheduleVersion = "A",
): Promise<ScheduleItem> {
  const db = await getDb();
  const dayId = await ensureDay(db, version, dayOfWeek);
  const now = new Date().toISOString();

  const maxRow = await db.query<{ max_order: number | null }>(
    "SELECT MAX(sort_order) AS max_order FROM schedule_items WHERE daily_schedule_id = $1",
    [dayId],
  );
  const nextOrder = (maxRow.rows[0]?.max_order ?? -1) + 1;

  const created = await db.query<ScheduleItemRow>(
    `INSERT INTO schedule_items
       (daily_schedule_id, subject, start_time, end_time, teacher, room, exam_date,
        sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      dayId,
      input.subject,
      input.startTime,
      input.endTime,
      input.teacher ?? "",
      input.room ?? "",
      input.examDate ?? null,
      nextOrder,
      now,
      now,
    ],
  );

  await db.query("UPDATE daily_schedules SET updated_at = $1 WHERE id = $2", [now, dayId]);

  const row = created.rows[0];
  if (!row) throw new Error("Gagal menyimpan pelajaran");
  return mapItem(row);
}

/** Locate an item's version and weekday so callers can re-read that exact day. */
export async function getScheduleLocationOfItem(
  itemId: number,
): Promise<{ version: ScheduleVersion; dayOfWeek: number } | null> {
  const db = await getDb();
  const result = await db.query<{ version: ScheduleVersion; day_of_week: number }>(
    `SELECT d.version, d.day_of_week
       FROM schedule_items i
       JOIN daily_schedules d ON d.id = i.daily_schedule_id
      WHERE i.id = $1`,
    [itemId],
  );
  const row = result.rows[0];
  return row ? { version: row.version, dayOfWeek: row.day_of_week } : null;
}

export async function updateScheduleItem(
  itemId: number,
  input: ScheduleItemDraft,
): Promise<ScheduleItem | null> {
  const db = await getDb();
  const now = new Date().toISOString();

  const updated = await db.query<ScheduleItemRow>(
    `UPDATE schedule_items
        SET subject = $1, start_time = $2, end_time = $3, teacher = $4,
            room = $5, exam_date = $6, updated_at = $7
      WHERE id = $8
      RETURNING *`,
    [
      input.subject,
      input.startTime,
      input.endTime,
      input.teacher ?? "",
      input.room ?? "",
      input.examDate ?? null,
      now,
      itemId,
    ],
  );

  const row = updated.rows[0];
  if (!row) return null;

  await db.query("UPDATE daily_schedules SET updated_at = $1 WHERE id = $2", [
    now,
    row.daily_schedule_id,
  ]);

  return mapItem(row);
}

export async function deleteScheduleItem(
  itemId: number,
): Promise<{ version: ScheduleVersion; dayOfWeek: number } | null> {
  const db = await getDb();

  const existing = await db.query<{ daily_schedule_id: number; version: ScheduleVersion; day_of_week: number }>(
    `SELECT i.daily_schedule_id, d.version, d.day_of_week
       FROM schedule_items i
       JOIN daily_schedules d ON d.id = i.daily_schedule_id
      WHERE i.id = $1`,
    [itemId],
  );
  const found = existing.rows[0];
  if (!found) return null;

  await db.query("DELETE FROM schedule_items WHERE id = $1", [itemId]);
  await db.query("UPDATE daily_schedules SET updated_at = $1 WHERE id = $2", [
    new Date().toISOString(),
    found.daily_schedule_id,
  ]);

  return { version: found.version, dayOfWeek: found.day_of_week };
}

export async function reorderScheduleItems(
  dayOfWeek: number,
  orderedIds: number[],
  version: ScheduleVersion = "A",
): Promise<ScheduleItem[]> {
  const db = await getDb();
  const schedule = await getScheduleForDay(dayOfWeek, version);
  if (!schedule) return [];

  const owned = new Set(schedule.items.map((item) => item.id));
  if (orderedIds.some((id) => !owned.has(id))) {
    throw new Error("Daftar urutan berisi pelajaran dari hari lain");
  }

  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.query("UPDATE schedule_items SET sort_order = $1, updated_at = $2 WHERE id = $3", [
        index,
        now,
        id,
      ]);
    }
    await tx.query("UPDATE daily_schedules SET updated_at = $1 WHERE id = $2", [now, schedule.id]);
  });

  const after = await getScheduleForDay(dayOfWeek, version);
  return after?.items ?? [];
}

export interface ScheduleSettings extends ExamConfig {
  updatedAt: string;
}

const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  mode: "AUTO",
  examEnabled: false,
  examStartDate: null,
  examEndDate: null,
  updatedAt: "",
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const db = await getDb();
  const rows = await db.query<{
    mode: ScheduleMode;
    exam_enabled: boolean;
    exam_start_date: string | Date | null;
    exam_end_date: string | Date | null;
    updated_at: Date | string;
  }>("SELECT * FROM schedule_settings WHERE id = 1");

  const row = rows.rows[0];
  if (!row) return DEFAULT_SCHEDULE_SETTINGS;

  return {
    mode: row.mode,
    examEnabled: row.exam_enabled,
    examStartDate: row.exam_start_date ? toDateKey(row.exam_start_date) : null,
    examEndDate: row.exam_end_date ? toDateKey(row.exam_end_date) : null,
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function saveScheduleSettings(input: ExamConfig): Promise<ScheduleSettings> {
  const db = await getDb();

  await db.query(
    `INSERT INTO schedule_settings
       (id, mode, exam_enabled, exam_start_date, exam_end_date, updated_at)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       mode = EXCLUDED.mode,
       exam_enabled = EXCLUDED.exam_enabled,
       exam_start_date = EXCLUDED.exam_start_date,
       exam_end_date = EXCLUDED.exam_end_date,
       updated_at = EXCLUDED.updated_at`,
    [
      input.mode,
      input.examEnabled,
      input.examStartDate,
      input.examEndDate,
      new Date().toISOString(),
    ],
  );

  return getScheduleSettings();
}

export async function listAssignments(): Promise<Assignment[]> {
  const db = await getDb();
  const rows = await db.query<AssignmentRow>(
    "SELECT * FROM assignments ORDER BY due_date ASC, id ASC",
  );
  return rows.rows.map(mapAssignment);
}

export async function getAssignment(id: number): Promise<Assignment | null> {
  const db = await getDb();
  const rows = await db.query<AssignmentRow>("SELECT * FROM assignments WHERE id = $1", [id]);
  const row = rows.rows[0];
  return row ? mapAssignment(row) : null;
}

export async function createAssignment(input: AssignmentInput): Promise<Assignment> {
  const db = await getDb();
  const now = new Date().toISOString();

  const created = await db.query<AssignmentRow>(
    `INSERT INTO assignments
       (subject, title, description, assigned_day, due_date, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.subject,
      input.title,
      input.description ?? "",
      input.assignedDay ?? null,
      input.dueDate,
      input.notes ?? "",
      input.status,
      now,
      now,
    ],
  );

  const row = created.rows[0];
  if (!row) throw new Error("Gagal menyimpan tugas");
  return mapAssignment(row);
}

export async function updateAssignment(
  id: number,
  input: AssignmentInput,
): Promise<Assignment | null> {
  const db = await getDb();

  const updated = await db.query<AssignmentRow>(
    `UPDATE assignments
        SET subject = $1, title = $2, description = $3, assigned_day = $4,
            due_date = $5, notes = $6, status = $7, updated_at = $8
      WHERE id = $9
      RETURNING *`,
    [
      input.subject,
      input.title,
      input.description ?? "",
      input.assignedDay ?? null,
      input.dueDate,
      input.notes ?? "",
      input.status,
      new Date().toISOString(),
      id,
    ],
  );

  const row = updated.rows[0];
  return row ? mapAssignment(row) : null;
}

export async function deleteAssignment(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.query("DELETE FROM assignments WHERE id = $1", [id]);
  return result.rowCount > 0;
}

const DEFAULT_SETTINGS: ClassSettings = {
  className: "X RPL 1",
  description:
    "Kelas X RPL 1 adalah kelas jurusan Rekayasa Perangkat Lunak. Halaman ini menjadi pusat informasi jadwal pelajaran, tugas, dan pengumuman kelas.",
  homeroomTeacher: "",
  academicYear: "",
  announcement: "",
  updatedAt: "",
};

export async function getClassSettings(): Promise<ClassSettings> {
  const db = await getDb();
  const rows = await db.query<ClassSettingsRow>("SELECT * FROM class_settings WHERE id = 1");
  const row = rows.rows[0];
  if (!row) return DEFAULT_SETTINGS;

  return {
    className: row.class_name,
    description: row.description,
    homeroomTeacher: row.homeroom_teacher,
    academicYear: row.academic_year,
    announcement: row.announcement,
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function saveClassSettings(input: ClassSettingsInput): Promise<ClassSettings> {
  const db = await getDb();

  await db.query(
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
      input.className,
      input.description,
      input.homeroomTeacher ?? "",
      input.academicYear ?? "",
      input.announcement ?? "",
      new Date().toISOString(),
    ],
  );

  return getClassSettings();
}

export interface Stats {
  totalScheduleItems: number;
  totalSubjects: number;
  totalAssignments: number;
  activeAssignments: number;
  overdueAssignments: number;
  completedAssignments: number;
  daysWithSchedule: number;
}

export async function getStats(todayKey: string): Promise<Stats> {
  const db = await getDb();

  // Exam entries are a separate dataset; class statistics stay about A and B.
  const items = await db.query<{ total: string | number; subjects: string | number }>(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT si.subject) AS subjects
       FROM schedule_items si
       JOIN daily_schedules ds ON ds.id = si.daily_schedule_id
      WHERE ds.version <> 'EXAM'`,
  );

  const days = await db.query<{ total: string | number }>(
    `SELECT COUNT(DISTINCT si.daily_schedule_id) AS total
       FROM schedule_items si
       JOIN daily_schedules ds ON ds.id = si.daily_schedule_id
      WHERE ds.version <> 'EXAM'`,
  );

  const assignments = await db.query<{
    total: string | number;
    active: string | number | null;
    completed: string | number | null;
    overdue: string | number | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'active' AND due_date < $1::date THEN 1 ELSE 0 END) AS overdue
     FROM assignments`,
    [todayKey],
  );

  const num = (value: string | number | null | undefined): number =>
    value === null || value === undefined ? 0 : Number(value);

  const itemRow = items.rows[0];
  const dayRow = days.rows[0];
  const assignmentRow = assignments.rows[0];

  return {
    totalScheduleItems: num(itemRow?.total),
    totalSubjects: num(itemRow?.subjects),
    totalAssignments: num(assignmentRow?.total),
    activeAssignments: num(assignmentRow?.active),
    overdueAssignments: num(assignmentRow?.overdue),
    completedAssignments: num(assignmentRow?.completed),
    daysWithSchedule: num(dayRow?.total),
  };
}
