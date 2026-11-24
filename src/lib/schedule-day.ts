import {
  addCivilDays,
  civilDateKey,
  formatDateId,
  fromJakartaParts,
  toJakartaParts,
  type SchoolWeekday,
} from "./time";

export type { SchoolWeekday } from "./time";

/** Hour at which the displayed schedule rolls over to the next school day. */
export const ROLLOVER_HOUR = 19;

export const SCHOOL_DAYS: readonly SchoolWeekday[] = [1, 2, 3, 4, 5] as const;

export const SCHOOL_DAY_NAMES: Record<SchoolWeekday, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
};

export const SCHOOL_DAY_SHORT: Record<SchoolWeekday, string> = {
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
};

export function isSchoolWeekday(value: number): value is SchoolWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export interface DisplayDay {
  /** School day whose schedule is currently shown. */
  activeDay: SchoolWeekday;
  /** Jakarta civil date the displayed schedule belongs to. */
  activeDate: { year: number; month: number; day: number; weekday: SchoolWeekday };
  /** Human readable active date in Indonesian. */
  activeDateLabel: string;
  /** ISO date key (`YYYY-MM-DD`) of the active date. */
  activeDateKey: string;
  /** True when the shown schedule is the real current calendar day. */
  isRealToday: boolean;
  /** True when the 19:00 rollover already moved us past the calendar day. */
  isAfterRollover: boolean;
  /** Milliseconds until the next 19:00 Jakarta rollover. */
  msUntilRollover: number;
  /** Exact instant of the next rollover, ISO 8601 UTC. */
  nextRolloverAt: string;
  /** School day that takes over after the next rollover. */
  nextDay: SchoolWeekday;
  /** Label of the next school day's date. */
  nextDateLabel: string;
}

/**
 * The single rule used by both server and client:
 *
 * - Mon–Thu before 19:00 -> that same day.
 * - Mon–Thu from 19:00   -> the next school day.
 * - Friday before 19:00  -> Friday.
 * - Friday from 19:00    -> the following Monday.
 * - Saturday / Sunday    -> the following Monday.
 *
 * It only decides which day is displayed. Stored schedules are never touched.
 */
export function resolveDisplayDay(instant: Date): DisplayDay {
  const now = toJakartaParts(instant);
  const today = { year: now.year, month: now.month, day: now.day };

  const isWeekend = now.weekday === 0 || now.weekday === 6;
  const afterRollover = !isWeekend && now.hour >= ROLLOVER_HOUR;

  let cursor = today;
  let activeDay: SchoolWeekday;

  if (isWeekend) {
    const toMonday = now.weekday === 6 ? 2 : 1;
    const monday = addCivilDays(today, toMonday);
    cursor = { year: monday.year, month: monday.month, day: monday.day };
    activeDay = 1;
  } else if (afterRollover) {
    const forward = now.weekday === 5 ? 3 : 1;
    const next = addCivilDays(today, forward);
    cursor = { year: next.year, month: next.month, day: next.day };
    activeDay = now.weekday === 5 ? 1 : ((now.weekday + 1) as SchoolWeekday);
  } else {
    activeDay = now.weekday as SchoolWeekday;
  }

  // The rollover that ends the currently displayed day is 19:00 of that
  // displayed date. If it already passed (weekend, or after 19:00) the next
  // one belongs to the date we are now showing.
  const rolloverAt = fromJakartaParts(cursor.year, cursor.month, cursor.day, ROLLOVER_HOUR);

  const nextDay: SchoolWeekday = activeDay === 5 ? 1 : ((activeDay + 1) as SchoolWeekday);
  const nextForward = activeDay === 5 ? 3 : 1;
  const nextCivil = addCivilDays(cursor, nextForward);

  const activeDate = { ...cursor, weekday: activeDay } as DisplayDay["activeDate"];

  return {
    activeDay,
    activeDate,
    activeDateLabel: formatDateId(activeDate),
    activeDateKey: civilDateKey(cursor),
    isRealToday: !isWeekend && !afterRollover,
    isAfterRollover: afterRollover,
    msUntilRollover: Math.max(0, rolloverAt.getTime() - instant.getTime()),
    nextRolloverAt: rolloverAt.toISOString(),
    nextDay,
    nextDateLabel: formatDateId({ ...nextCivil, weekday: nextDay }),
  };
}

/** Client-safe countdown formatting: `HH:MM:SS`. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}
