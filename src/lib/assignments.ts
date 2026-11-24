import { addCivilDays, civilDateKey, parseDateKey, toJakartaParts } from "./time";
import type { Assignment } from "./repository";

export type DeadlineState = "overdue" | "today" | "tomorrow" | "upcoming" | "completed";

export interface DeadlineInfo {
  state: DeadlineState;
  label: string;
  daysRemaining: number;
}

/** Whole-day difference between the Jakarta "today" and an `YYYY-MM-DD` due date. */
export function daysUntil(dueDate: string, instant: Date = new Date()): number {
  const due = parseDateKey(dueDate);
  if (!due) return Number.NaN;

  const now = toJakartaParts(instant);
  const todayUtc = Date.UTC(now.year, now.month - 1, now.day);
  const dueUtc = Date.UTC(due.year, due.month - 1, due.day);
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

export function describeDeadline(assignment: Pick<Assignment, "dueDate" | "status">, instant?: Date): DeadlineInfo {
  if (assignment.status === "completed") {
    return { state: "completed", label: "Selesai", daysRemaining: 0 };
  }

  const diff = daysUntil(assignment.dueDate, instant);
  if (Number.isNaN(diff)) return { state: "upcoming", label: "Tanggal tidak valid", daysRemaining: 0 };

  if (diff < 0) {
    const late = Math.abs(diff);
    return {
      state: "overdue",
      label: `Lewat ${late} hari`,
      daysRemaining: diff,
    };
  }
  if (diff === 0) return { state: "today", label: "Jatuh tempo hari ini", daysRemaining: 0 };
  if (diff === 1) return { state: "tomorrow", label: "Jatuh tempo besok", daysRemaining: 1 };
  return { state: "upcoming", label: `${diff} hari lagi`, daysRemaining: diff };
}

export function deadlineTone(state: DeadlineState): "clay" | "amber" | "moss" | "outline" {
  switch (state) {
    case "overdue":
      return "clay";
    case "today":
    case "tomorrow":
      return "amber";
    case "completed":
      return "moss";
    default:
      return "outline";
  }
}

/** Sort: active before completed, then nearest deadline first. */
export function sortAssignments(assignments: Assignment[], instant?: Date): Assignment[] {
  return [...assignments].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    const da = daysUntil(a.dueDate, instant);
    const db = daysUntil(b.dueDate, instant);
    if (da !== db) return da - db;
    return a.id - b.id;
  });
}

/** Assignments relevant to the schedule currently shown. */
export function assignmentsForDay(assignments: Assignment[], dayOfWeek: number): Assignment[] {
  return assignments.filter((a) => a.assignedDay === dayOfWeek);
}

export function todayKey(instant: Date = new Date()): string {
  const now = toJakartaParts(instant);
  return civilDateKey({ year: now.year, month: now.month, day: now.day });
}

export function tomorrowKey(instant: Date = new Date()): string {
  const now = toJakartaParts(instant);
  const next = addCivilDays({ year: now.year, month: now.month, day: now.day }, 1);
  return civilDateKey(next);
}

/** Format an `YYYY-MM-DD` key as an Indonesian short date, e.g. "24 Nov 2026". */
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export function formatDueDate(dueDate: string): string {
  const parsed = parseDateKey(dueDate);
  if (!parsed) return dueDate;
  return `${parsed.day} ${SHORT_MONTHS[parsed.month - 1]} ${parsed.year}`;
}
