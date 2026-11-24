import { describe, expect, it } from "vitest";
import { resolveDisplayDay } from "@/lib/schedule-day";
import { fromJakartaParts, toJakartaParts } from "@/lib/time";

/** Build an instant from a Jakarta wall-clock time on a fixed civil date. */
function jakartaTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return fromJakartaParts(year, month, day, hour, minute, 0);
}

describe("toJakartaParts", () => {
  it("converts UTC to Jakarta wall clock (UTC+7)", () => {
    const instant = new Date("2026-11-23T02:30:00.000Z"); // Monday
    const parts = toJakartaParts(instant);
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(30);
    expect(parts.day).toBe(23);
    expect(parts.weekday).toBe(1);
  });

  it("is independent of the host timezone (explicit Z input)", () => {
    const parts = toJakartaParts(new Date("2026-11-28T18:00:00.000Z")); // Sat 18:00 UTC
    expect(parts.weekday).toBe(0); // Sunday 01:00 WIB
    expect(parts.hour).toBe(1);
    expect(parts.day).toBe(29);
  });
});

describe("resolveDisplayDay — weekday rollover at 19:00 WIB", () => {
  // 2026-11-23 is a Monday.
  it("Monday 00:00 shows Monday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 23, 0, 0)).activeDay).toBe(1);
  });

  it("Monday 18:59 still shows Monday", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 23, 18, 59));
    expect(result.activeDay).toBe(1);
    expect(result.isAfterRollover).toBe(false);
    expect(result.isRealToday).toBe(true);
  });

  it("Monday exactly 19:00 switches to Tuesday", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 23, 19, 0));
    expect(result.activeDay).toBe(2);
    expect(result.isAfterRollover).toBe(true);
  });

  it("Tuesday 19:00 switches to Wednesday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 24, 19, 0)).activeDay).toBe(3);
  });

  it("Wednesday 19:00 switches to Thursday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 25, 19, 0)).activeDay).toBe(4);
  });

  it("Thursday 19:00 switches to Friday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 26, 19, 0)).activeDay).toBe(5);
  });

  it("Friday 19:00 switches to Monday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 27, 19, 0)).activeDay).toBe(1);
  });

  it("Saturday at any hour shows Monday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 28, 9, 0)).activeDay).toBe(1);
    expect(resolveDisplayDay(jakartaTime(2026, 11, 28, 20, 0)).activeDay).toBe(1);
  });

  it("Sunday at any hour shows Monday", () => {
    expect(resolveDisplayDay(jakartaTime(2026, 11, 29, 9, 0)).activeDay).toBe(1);
    expect(resolveDisplayDay(jakartaTime(2026, 11, 29, 23, 59)).activeDay).toBe(1);
  });

  it("never resolves to Saturday or Sunday", () => {
    for (let day = 20; day <= 30; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const dayNumber = resolveDisplayDay(jakartaTime(2026, 11, day, hour)).activeDay;
        expect(dayNumber).toBeGreaterThanOrEqual(1);
        expect(dayNumber).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe("resolveDisplayDay — active date", () => {
  it("Monday after 19:00 shows Tuesday's date", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 23, 19, 0));
    expect(result.activeDateKey).toBe("2026-11-24");
    expect(result.activeDateLabel).toContain("Selasa");
  });

  it("Friday after 19:00 shows next Monday's date", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 27, 19, 0));
    expect(result.activeDateKey).toBe("2026-11-30");
    expect(result.activeDateLabel).toContain("Senin");
  });

  it("Saturday shows the coming Monday", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 28, 10, 0));
    expect(result.activeDateKey).toBe("2026-11-30");
  });

  it("Monday morning before 19:00 shows today", () => {
    const result = resolveDisplayDay(jakartaTime(2026, 11, 23, 8, 0));
    expect(result.activeDateKey).toBe("2026-11-23");
    expect(result.isRealToday).toBe(true);
  });
});

describe("resolveDisplayDay — countdown", () => {
  it("counts down to 19:00 on a weekday morning", () => {
    const instant = jakartaTime(2026, 11, 23, 12, 0);
    const result = resolveDisplayDay(instant);
    // 7 hours until 19:00
    expect(result.msUntilRollover).toBe(7 * 60 * 60 * 1000);
    expect(result.nextDay).toBe(2);
  });

  it("after rollover counts to the following day's 19:00", () => {
    const instant = jakartaTime(2026, 11, 23, 20, 0);
    const result = resolveDisplayDay(instant);
    expect(result.msUntilRollover).toBe(23 * 60 * 60 * 1000);
    expect(result.nextDay).toBe(3);
  });

  it("Friday evening shows Monday and counts down to Monday 19:00", () => {
    const instant = jakartaTime(2026, 11, 27, 20, 0);
    const result = resolveDisplayDay(instant);
    expect(result.activeDay).toBe(1);
    expect(result.nextDay).toBe(2);
    // Friday 20:00 -> Monday 19:00 = 71 hours.
    expect(result.msUntilRollover).toBe(71 * 60 * 60 * 1000);
  });
});

describe("rollover ignores the browser timezone", () => {
  it("produces the same result regardless of host TZ", () => {
    const instant = jakartaTime(2026, 11, 23, 19, 0);
    const original = process.env.TZ;
    const results: number[] = [];

    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Europe/London"]) {
      process.env.TZ = tz;
      results.push(resolveDisplayDay(instant).activeDay);
    }

    process.env.TZ = original;
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(2);
  });
});
