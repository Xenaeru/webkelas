/**
 * Waktu Indonesia Barat (WIB) helpers.
 *
 * Asia/Jakarta is permanently UTC+07:00 with no daylight saving, so the
 * offset is fixed. We still derive "wall clock" values through Intl so the
 * conversion is explicit and auditable, and we build instants from civil
 * fields with the same constant offset.
 */

export const JAKARTA_OFFSET_MINUTES = 7 * 60;
const OFFSET_MS = JAKARTA_OFFSET_MINUTES * 60_000;

/** 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay. */
export type CalendarWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** School weekdays only: 1 = Monday ... 5 = Friday. */
export type SchoolWeekday = 1 | 2 | 3 | 4 | 5;

export interface CivilDateTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  weekday: CalendarWeekday;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAY_LOOKUP: Record<string, CalendarWeekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Current wall-clock time in Jakarta, independent of the host timezone. */
export function toJakartaParts(instant: Date): CivilDateTime {
  const parts = formatter.formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayName = pick("weekday");

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second")),
    weekday: WEEKDAY_LOOKUP[weekdayName] ?? 0,
  };
}

/** Convert a Jakarta civil timestamp back to a real instant. */
export function fromJakartaParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - OFFSET_MS,
  );
}

/** Add whole days to a civil date, returning a new civil date at 00:00. */
export function addCivilDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number; weekday: CalendarWeekday } {
  const base = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    weekday: base.getUTCDay() as CalendarWeekday,
  };
}

/** ISO-ish date key (`YYYY-MM-DD`) for a Jakarta civil date. */
export function civilDateKey(date: { year: number; month: number; day: number }): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export function dayNameId(weekday: CalendarWeekday): string {
  return DAY_NAMES_ID[weekday];
}

/** Human readable Indonesian date, e.g. "Senin, 24 November 2026". */
export function formatDateId(date: { year: number; month: number; day: number; weekday: CalendarWeekday }): string {
  return `${DAY_NAMES_ID[date.weekday]}, ${date.day} ${MONTH_NAMES_ID[date.month - 1]} ${date.year}`;
}

/** Parse an `YYYY-MM-DD` string into a civil date. Returns null when invalid. */
export function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}
