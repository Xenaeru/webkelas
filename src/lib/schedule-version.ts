import {
  addCivilDays,
  civilDateKey,
  formatDateId,
  parseDateKey,
  toJakartaParts,
  type SchoolWeekday,
} from "./time";
import { resolveDisplayDay, type DisplayDay } from "./schedule-day";

/** A stored schedule variant. Each one is edited independently. */
export type ScheduleVersion = "A" | "B" | "EXAM";

/** Admin-chosen selection mode. */
export type ScheduleMode = "AUTO" | "EXAM" | "MANUAL_A" | "MANUAL_B";

export interface ExamConfig {
  mode: ScheduleMode;
  examEnabled: boolean;
  examStartDate: string | null;
  examEndDate: string | null;
}

export interface WeekInfo {
  /** 1-based week within the month, derived from the calendar day. */
  weekOfMonth: number;
  /** Schedule A or B chosen purely by week. */
  version: "A" | "B";
}

/**
 * Week of month = ceil(day / 7), i.e. dates 1–7 are week 1, 8–14 week 2,
 * 15–21 week 3, 22–28 week 4, and 29–31 week 5.
 *
 * This is a fixed calendar rule, not an assumption that a month has four
 * weeks: short months simply never reach week 5, and 29–31 day months always
 * do. Week 5 (and anything beyond) uses Jadwal B per the class rule.
 */
export function weekOfMonthFor(dateKey: string): number {
  const parsed = parseDateKey(dateKey);
  if (!parsed) throw new Error(`Tanggal tidak valid: ${dateKey}`);
  return Math.ceil(parsed.day / 7);
}

/** Jadwal A for weeks 1–2, Jadwal B for weeks 3 and up. */
export function versionForWeek(weekOfMonth: number): "A" | "B" {
  return weekOfMonth <= 2 ? "A" : "B";
}

export function weekInfoFor(dateKey: string): WeekInfo {
  const weekOfMonth = weekOfMonthFor(dateKey);
  return { weekOfMonth, version: versionForWeek(weekOfMonth) };
}

/** True when `dateKey` falls inside the configured exam window (inclusive). */
export function isWithinExamPeriod(dateKey: string, config: ExamConfig): boolean {
  if (!config.examEnabled) return false;

  // A manually activated exam has no window: it runs until switched off.
  const hasStart = Boolean(config.examStartDate);
  const hasEnd = Boolean(config.examEndDate);
  if (!hasStart && !hasEnd) return true;

  if (hasStart && dateKey < config.examStartDate!) return false;
  if (hasEnd && dateKey > config.examEndDate!) return false;
  return true;
}

export interface ResolvedSchedule {
  /** Schedule variant the public site must display. */
  version: ScheduleVersion;
  /** Why this variant won, useful for badges and admin diagnostics. */
  source: "EXAM" | "MANUAL_A" | "MANUAL_B" | "AUTO_WEEK";
  /** Week of the month the displayed date falls in. */
  weekOfMonth: number;
  /** Week-based variant, even when an override is in effect. */
  weekVersion: "A" | "B";
  /** True when the exam schedule is what is being shown. */
  examActive: boolean;
  /** Indonesian label such as "JADWAL A — MINGGU 2". */
  label: string;
}

/**
 * The single source of truth for "which schedule should be showing".
 *
 * Priority, strictly in this order:
 *   1. Exam schedule, when enabled and the displayed date is in its window.
 *   2. Manual Jadwal A.
 *   3. Manual Jadwal B.
 *   4. Automatic: week 1–2 -> A, week 3+ -> B.
 *
 * Everything is evaluated against the *displayed* Jakarta date (which already
 * accounts for the 19:00 rollover), so a rollover into a new month or a new
 * week automatically picks the right variant.
 */
export function resolveActiveSchedule(
  displayDay: DisplayDay,
  config: ExamConfig,
): ResolvedSchedule {
  const dateKey = displayDay.activeDateKey;
  const weekOfMonth = weekOfMonthFor(dateKey);
  const weekVersion = versionForWeek(weekOfMonth);

  if (isWithinExamPeriod(dateKey, config)) {
    return {
      version: "EXAM",
      source: "EXAM",
      weekOfMonth,
      weekVersion,
      examActive: true,
      label: "JADWAL UJIAN",
    };
  }

  if (config.mode === "MANUAL_A") {
    return {
      version: "A",
      source: "MANUAL_A",
      weekOfMonth,
      weekVersion,
      examActive: false,
      label: `JADWAL A — MINGGU ${weekOfMonth}`,
    };
  }

  if (config.mode === "MANUAL_B") {
    return {
      version: "B",
      source: "MANUAL_B",
      weekOfMonth,
      weekVersion,
      examActive: false,
      label: `JADWAL B — MINGGU ${weekOfMonth}`,
    };
  }

  // AUTO, and the fallback when an exam or manual override is no longer valid.
  return {
    version: weekVersion,
    source: "AUTO_WEEK",
    weekOfMonth,
    weekVersion,
    examActive: false,
    label: `JADWAL ${weekVersion} — MINGGU ${weekOfMonth}`,
  };
}

export interface ScheduleContext {
  displayDay: DisplayDay;
  active: ResolvedSchedule;
}

/**
 * Build the whole display context for an instant: which day is shown, which
 * week it belongs to, and which schedule variant that resolves to.
 */
export function resolveScheduleContext(instant: Date, config: ExamConfig): ScheduleContext {
  const displayDay = resolveDisplayDay(instant);
  return { displayDay, active: resolveActiveSchedule(displayDay, config) };
}

/** Human-readable Indonesian exam window, or null when unset. */
export function formatExamPeriod(config: ExamConfig): string | null {
  const label = (value: string): string | null => {
    const parts = parseDateKey(value);
    if (!parts) return null;
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    // Drop the weekday prefix: "Senin, 1 Desember 2026" -> "1 Desember 2026".
    return formatDateId({ ...parts, weekday: weekday as 0 }).split(", ")[1] ?? null;
  };

  const start = config.examStartDate ? label(config.examStartDate) : null;
  const end = config.examEndDate ? label(config.examEndDate) : null;

  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `Mulai ${start}`;
  if (end) return `Sampai ${end}`;
  return null;
}

/**
 * The next date at which the automatic week bucket changes. Within week 5 the
 * next boundary is the 1st of the following month (which is week 1 again).
 */
export function upcomingWeekBoundary(dateKey: string): { dateKey: string; weekOfMonth: number } {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new Error(`Tanggal tidak valid: ${dateKey}`);

  const currentWeek = weekOfMonthFor(dateKey);
  const nextBoundaryDay = currentWeek * 7 + 1;

  // 29–31 day months put us in week 5; the next bucket starts next month.
  const next =
    nextBoundaryDay > daysInMonth(parts.year, parts.month)
      ? addCivilDays(parts, daysInMonth(parts.year, parts.month) - parts.day + 1)
      : addCivilDays(parts, nextBoundaryDay - parts.day);

  const key = civilDateKey(next);
  return { dateKey: key, weekOfMonth: weekOfMonthFor(key) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Convenience: Jakarta date key for an instant. */
export function jakartaDateKey(instant: Date): string {
  return civilDateKey(toJakartaParts(instant));
}

export type { SchoolWeekday };
