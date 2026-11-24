import { describe, expect, it } from "vitest";
import {
  formatExamPeriod,
  isWithinExamPeriod,
  jakartaDateKey,
  resolveActiveSchedule,
  resolveScheduleContext,
  upcomingWeekBoundary,
  versionForWeek,
  weekInfoFor,
  weekOfMonthFor,
  type ExamConfig,
} from "@/lib/schedule-version";
import { resolveDisplayDay } from "@/lib/schedule-day";
import type { DisplayDay } from "@/lib/schedule-day";

const auto: ExamConfig = {
  mode: "AUTO",
  examEnabled: false,
  examStartDate: null,
  examEndDate: null,
};

/** Build a display day for an explicit calendar date, bypassing the clock. */
function dayFor(dateKey: string): DisplayDay {
  const [year, month, day] = dateKey.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day!, 9, 0, 0));
  return resolveDisplayDay(instant);
}

describe("week of month", () => {
  it("maps dates 1-7 to week 1 and 8-14 to week 2", () => {
    expect(weekOfMonthFor("2026-11-01")).toBe(1);
    expect(weekOfMonthFor("2026-11-07")).toBe(1);
    expect(weekOfMonthFor("2026-11-08")).toBe(2);
    expect(weekOfMonthFor("2026-11-14")).toBe(2);
  });

  it("maps 15-21 to week 3, 22-28 to week 4 and 29-31 to week 5", () => {
    expect(weekOfMonthFor("2026-11-15")).toBe(3);
    expect(weekOfMonthFor("2026-11-21")).toBe(3);
    expect(weekOfMonthFor("2026-11-22")).toBe(4);
    expect(weekOfMonthFor("2026-11-28")).toBe(4);
    expect(weekOfMonthFor("2026-11-29")).toBe(5);
    expect(weekOfMonthFor("2026-11-30")).toBe(5);
  });

  it("never reaches week 5 in February", () => {
    expect(weekOfMonthFor("2027-02-28")).toBe(4);
    expect(weekInfoFor("2027-02-28").version).toBe("B");
  });

  it("assigns A to weeks 1-2 and B to weeks 3, 4 and 5", () => {
    expect([1, 2, 3, 4, 5].map(versionForWeek)).toEqual(["A", "A", "B", "B", "B"]);
  });

  it("rejects an invalid date", () => {
    expect(() => weekOfMonthFor("2026-13-01")).toThrow();
  });
});

describe("exam window", () => {
  const windowed: ExamConfig = {
    mode: "EXAM",
    examEnabled: true,
    examStartDate: "2026-12-01",
    examEndDate: "2026-12-12",
  };

  it("is inactive when disabled, even inside the dates", () => {
    expect(isWithinExamPeriod("2026-12-05", { ...windowed, examEnabled: false })).toBe(false);
  });

  it("treats both boundaries as inclusive", () => {
    expect(isWithinExamPeriod("2026-12-01", windowed)).toBe(true);
    expect(isWithinExamPeriod("2026-12-12", windowed)).toBe(true);
    expect(isWithinExamPeriod("2026-11-30", windowed)).toBe(false);
    expect(isWithinExamPeriod("2026-12-13", windowed)).toBe(false);
  });

  it("runs indefinitely when enabled without dates", () => {
    const open: ExamConfig = {
      mode: "EXAM",
      examEnabled: true,
      examStartDate: null,
      examEndDate: null,
    };
    expect(isWithinExamPeriod("2026-12-05", open)).toBe(true);
    expect(isWithinExamPeriod("2030-01-01", open)).toBe(true);
  });

  it("supports an open-ended start or end", () => {
    expect(isWithinExamPeriod("2027-01-01", { ...windowed, examEndDate: null })).toBe(true);
    expect(isWithinExamPeriod("2020-01-01", { ...windowed, examStartDate: null })).toBe(true);
  });

  it("formats the window for display", () => {
    expect(formatExamPeriod(windowed)).toBe("1 Desember 2026 – 12 Desember 2026");
    expect(formatExamPeriod({ ...windowed, examEndDate: null })).toBe("Mulai 1 Desember 2026");
    expect(formatExamPeriod({ ...windowed, examStartDate: null })).toBe("Sampai 12 Desember 2026");
    expect(
      formatExamPeriod({ ...windowed, examStartDate: null, examEndDate: null }),
    ).toBeNull();
  });
});

describe("active schedule resolution", () => {
  it("uses the week rule in automatic mode", () => {
    expect(resolveActiveSchedule(dayFor("2026-11-03"), auto).version).toBe("A");
    expect(resolveActiveSchedule(dayFor("2026-11-10"), auto).version).toBe("A");
    expect(resolveActiveSchedule(dayFor("2026-11-17"), auto).version).toBe("B");
    expect(resolveActiveSchedule(dayFor("2026-11-24"), auto).version).toBe("B");
    expect(resolveActiveSchedule(dayFor("2026-11-30"), auto).version).toBe("B");
  });

  it("labels the resolved schedule with its week", () => {
    const resolved = resolveActiveSchedule(dayFor("2026-11-03"), auto);
    expect(resolved.source).toBe("AUTO_WEEK");
    expect(resolved.weekOfMonth).toBe(1);
    expect(resolved.label).toBe("JADWAL A — MINGGU 1");
  });

  it("lets an active exam period override automatic mode", () => {
    const config: ExamConfig = {
      mode: "AUTO",
      examEnabled: true,
      examStartDate: "2026-11-24",
      examEndDate: "2026-11-26",
    };
    const resolved = resolveActiveSchedule(dayFor("2026-11-24"), config);
    expect(resolved.version).toBe("EXAM");
    expect(resolved.source).toBe("EXAM");
    expect(resolved.examActive).toBe(true);
    expect(resolved.weekVersion).toBe("B");
    expect(resolved.label).toBe("JADWAL UJIAN");
  });

  it("falls back to the week rule after the exam window ends", () => {
    const config: ExamConfig = {
      mode: "AUTO",
      examEnabled: true,
      examStartDate: "2026-11-01",
      examEndDate: "2026-11-07",
    };
    const resolved = resolveActiveSchedule(dayFor("2026-11-10"), config);
    expect(resolved.version).toBe("A");
    expect(resolved.source).toBe("AUTO_WEEK");
  });

  it("honours manual A and manual B over the week rule", () => {
    const manualA: ExamConfig = { ...auto, mode: "MANUAL_A" };
    const manualB: ExamConfig = { ...auto, mode: "MANUAL_B" };

    // 2026-11-24 would be Jadwal B automatically.
    expect(resolveActiveSchedule(dayFor("2026-11-24"), manualA).version).toBe("A");
    expect(resolveActiveSchedule(dayFor("2026-11-24"), manualA).source).toBe("MANUAL_A");

    // 2026-11-03 would be Jadwal A automatically.
    expect(resolveActiveSchedule(dayFor("2026-11-03"), manualB).version).toBe("B");
    expect(resolveActiveSchedule(dayFor("2026-11-03"), manualB).source).toBe("MANUAL_B");
  });

  it("gives the exam priority over a manual override", () => {
    const config: ExamConfig = {
      mode: "MANUAL_B",
      examEnabled: true,
      examStartDate: "2026-11-20",
      examEndDate: "2026-11-30",
    };
    expect(resolveActiveSchedule(dayFor("2026-11-24"), config).version).toBe("EXAM");
  });

  it("keeps exam mode authoritative when enabled without dates", () => {
    const config: ExamConfig = {
      mode: "EXAM",
      examEnabled: true,
      examStartDate: null,
      examEndDate: null,
    };
    expect(resolveActiveSchedule(dayFor("2026-11-04"), config).version).toBe("EXAM");
  });
});

describe("19:00 rollover interaction", () => {
  it("shows the next day and its week bucket after 19:00 Jakarta time", () => {
    // 2026-11-16 is a Monday; at 19:00 WIB it rolls over to Tuesday the 17th,
    // which is week 3 — and therefore Jadwal B.
    const instant = new Date("2026-11-16T12:00:00.000Z");
    const context = resolveScheduleContext(instant, auto);

    expect(jakartaDateKey(instant)).toBe("2026-11-16");
    expect(context.displayDay.activeDateKey).toBe("2026-11-17");
    expect(context.active.version).toBe("B");
    expect(context.active.weekOfMonth).toBe(3);
  });

  it("rolls over into a new month and resets to week 1", () => {
    // 2026-11-30 is week 5 (B). After 19:00 WIB it displays 1 December, week 1 (A).
    const instant = new Date("2026-11-30T12:00:00.000Z");
    const context = resolveScheduleContext(instant, auto);

    expect(context.displayDay.activeDateKey).toBe("2026-12-01");
    expect(context.active.weekOfMonth).toBe(1);
    expect(context.active.version).toBe("A");
  });

  it("does not roll over before 19:00", () => {
    const instant = new Date("2026-11-16T11:00:00.000Z");
    const context = resolveScheduleContext(instant, auto);
    expect(context.displayDay.activeDateKey).toBe("2026-11-16");
    expect(context.active.version).toBe("B");
  });
});

describe("week boundaries", () => {
  it("points at the next week start within the month", () => {
    expect(upcomingWeekBoundary("2026-11-03")).toEqual({
      dateKey: "2026-11-08",
      weekOfMonth: 2,
    });
    expect(upcomingWeekBoundary("2026-11-14")).toEqual({
      dateKey: "2026-11-15",
      weekOfMonth: 3,
    });
  });

  it("points at the next month when already in week 5", () => {
    expect(upcomingWeekBoundary("2026-11-29")).toEqual({
      dateKey: "2026-12-01",
      weekOfMonth: 1,
    });
  });

  it("handles a 30-day month boundary", () => {
    expect(upcomingWeekBoundary("2026-11-30")).toEqual({
      dateKey: "2026-12-01",
      weekOfMonth: 1,
    });
  });
});
