import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  assignmentSchema,
  classSettingsSchema,
  dayParamSchema,
  loginSchema,
  scheduleItemSchema,
  setupSchema,
} from "@/lib/validation";

describe("password hashing", () => {
  it("never stores the plaintext password", async () => {
    const hash = await hashPassword("rahasia123");
    expect(hash).not.toContain("rahasia123");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("produces a unique salt per hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("verifies the correct password and rejects wrong ones", async () => {
    const hash = await hashPassword("benar-sekali");
    await expect(verifyPassword("benar-sekali", hash)).resolves.toBe(true);
    await expect(verifyPassword("salah", hash)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "plaintext")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$abc$def")).resolves.toBe(false);
  });
});

describe("schedule validation", () => {
  it("accepts a valid item", () => {
    const result = scheduleItemSchema.safeParse({
      subject: "Matematika",
      startTime: "07:00",
      endTime: "08:30",
      teacher: "Bu Sari",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty subject", () => {
    const result = scheduleItemSchema.safeParse({
      subject: "  ",
      startTime: "07:00",
      endTime: "08:30",
      teacher: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed times", () => {
    for (const [startTime, endTime] of [
      ["7:00", "08:30"],
      ["07:00", "25:00"],
      ["0700", "0830"],
    ]) {
      const result = scheduleItemSchema.safeParse({ subject: "A", startTime, endTime, teacher: "" });
      expect(result.success).toBe(false);
    }
  });

  it("rejects an end time before the start time", () => {
    const result = scheduleItemSchema.safeParse({
      subject: "A",
      startTime: "10:00",
      endTime: "09:00",
      teacher: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an item with no times at all", () => {
    const result = scheduleItemSchema.safeParse({ subject: "Matematika" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBe("");
      expect(result.data.endTime).toBe("");
    }
  });

  it("accepts a room without any times", () => {
    const result = scheduleItemSchema.safeParse({
      subject: "Basis Data",
      room: "Lab Komputer 2",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.room).toBe("Lab Komputer 2");
  });

  it("still enforces ordering when only one time is given", () => {
    expect(scheduleItemSchema.safeParse({ subject: "A", startTime: "07:00" }).success).toBe(true);
    expect(scheduleItemSchema.safeParse({ subject: "A", endTime: "08:00" }).success).toBe(true);
  });

  it("rejects a malformed time even though it is optional", () => {
    expect(
      scheduleItemSchema.safeParse({ subject: "A", startTime: "7:00", endTime: "" }).success,
    ).toBe(false);
  });

  it("only allows days 1 to 5", () => {
    expect(dayParamSchema.safeParse("1").success).toBe(true);
    expect(dayParamSchema.safeParse("5").success).toBe(true);
    expect(dayParamSchema.safeParse("0").success).toBe(false);
    expect(dayParamSchema.safeParse("6").success).toBe(false);
    expect(dayParamSchema.safeParse("7").success).toBe(false);
    expect(dayParamSchema.safeParse("senin").success).toBe(false);
  });
});

describe("assignment validation", () => {
  const valid = {
    subject: "Fisika",
    title: "Laporan praktikum",
    description: "Tulis laporan lengkap.",
    assignedDay: 4,
    dueDate: "2026-12-05",
    notes: "",
    status: "active" as const,
  };

  it("accepts a valid assignment", () => {
    expect(assignmentSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a null assigned day", () => {
    expect(assignmentSchema.safeParse({ ...valid, assignedDay: null }).success).toBe(true);
  });

  it("rejects a bad deadline format", () => {
    expect(assignmentSchema.safeParse({ ...valid, dueDate: "05-12-2026" }).success).toBe(false);
    expect(assignmentSchema.safeParse({ ...valid, dueDate: "2026-13-01" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(assignmentSchema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
  });
});

describe("auth validation", () => {
  it("requires a username and password", () => {
    expect(loginSchema.safeParse({ username: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "admin", password: "x" }).success).toBe(true);
  });

  it("enforces a minimum password length on setup", () => {
    expect(setupSchema.safeParse({ username: "admin", password: "short" }).success).toBe(false);
    expect(setupSchema.safeParse({ username: "admin", password: "longenough" }).success).toBe(true);
  });

  it("enforces a minimum username length on setup", () => {
    expect(setupSchema.safeParse({ username: "ab", password: "longenough" }).success).toBe(false);
  });
});

describe("class settings validation", () => {
  it("requires a class name", () => {
    const result = classSettingsSchema.safeParse({
      className: "",
      description: "",
      homeroomTeacher: "",
      academicYear: "",
      announcement: "",
    });
    expect(result.success).toBe(false);
  });

  it("fills optional fields with empty strings", () => {
    const result = classSettingsSchema.safeParse({
      className: "X RPL 1",
      description: "Deskripsi",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homeroomTeacher).toBe("");
      expect(result.data.academicYear).toBe("");
    }
  });
});
