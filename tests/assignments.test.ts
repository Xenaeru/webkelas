import { describe, expect, it } from "vitest";
import {
  daysUntil,
  describeDeadline,
  formatDueDate,
  sortAssignments,
} from "@/lib/assignments";
import { fromJakartaParts } from "@/lib/time";
import type { Assignment } from "@/lib/repository";

function makeAssignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: 1,
    subject: "Matematika",
    title: "Tugas",
    description: "",
    assignedDay: null,
    dueDate: "2026-11-24",
    notes: "",
    status: "active",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = fromJakartaParts(2026, 11, 24, 10, 0); // Tuesday 10:00 WIB

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil("2026-11-24", NOW)).toBe(0);
  });

  it("returns a positive value for future dates", () => {
    expect(daysUntil("2026-11-27", NOW)).toBe(3);
  });

  it("returns a negative value for past dates", () => {
    expect(daysUntil("2026-11-20", NOW)).toBe(-4);
  });

  it("is stable regardless of the time of day", () => {
    const early = fromJakartaParts(2026, 11, 24, 0, 5);
    const late = fromJakartaParts(2026, 11, 24, 23, 55);
    expect(daysUntil("2026-11-26", early)).toBe(2);
    expect(daysUntil("2026-11-26", late)).toBe(2);
  });
});

describe("describeDeadline", () => {
  it("marks overdue assignments", () => {
    const info = describeDeadline(makeAssignment({ dueDate: "2026-11-22" }), NOW);
    expect(info.state).toBe("overdue");
    expect(info.label).toContain("Lewat 2 hari");
  });

  it("marks assignments due today", () => {
    const info = describeDeadline(makeAssignment({ dueDate: "2026-11-24" }), NOW);
    expect(info.state).toBe("today");
  });

  it("marks assignments due tomorrow", () => {
    const info = describeDeadline(makeAssignment({ dueDate: "2026-11-25" }), NOW);
    expect(info.state).toBe("tomorrow");
  });

  it("treats completed assignments as completed even when late", () => {
    const info = describeDeadline(
      makeAssignment({ dueDate: "2020-01-01", status: "completed" }),
      NOW,
    );
    expect(info.state).toBe("completed");
  });
});

describe("sortAssignments", () => {
  it("puts active before completed, then sorts by nearest deadline", () => {
    const list = [
      makeAssignment({ id: 1, status: "completed", dueDate: "2026-11-01" }),
      makeAssignment({ id: 2, status: "active", dueDate: "2026-12-01" }),
      makeAssignment({ id: 3, status: "active", dueDate: "2026-11-25" }),
      makeAssignment({ id: 4, status: "active", dueDate: "2026-11-20" }),
    ];

    expect(sortAssignments(list, NOW).map((a) => a.id)).toEqual([4, 3, 2, 1]);
  });
});

describe("formatDueDate", () => {
  it("formats an ISO key as an Indonesian short date", () => {
    expect(formatDueDate("2026-11-24")).toBe("24 Nov 2026");
    expect(formatDueDate("2026-01-05")).toBe("5 Jan 2026");
  });

  it("returns the raw value for invalid input", () => {
    expect(formatDueDate("bukan-tanggal")).toBe("bukan-tanggal");
  });
});
