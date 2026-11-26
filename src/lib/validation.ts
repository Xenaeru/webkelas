import { z } from "zod";

export const DAY_VALUES = [1, 2, 3, 4, 5] as const;

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const trimmed = (max: number, field: string) =>
  z
    .string()
    .trim()
    .max(max, `${field} maksimal ${max} karakter`);

const optionalText = (max: number, field: string) =>
  trimmed(max, field).optional().default("");

const dateKeySchema = z
  .string()
  .regex(dateKeyPattern, "Tanggal deadline harus YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return false;
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() + 1 === month &&
      probe.getUTCDate() === day
    );
  }, "Tanggal tidak valid");

export const dayParamSchema = z.coerce
  .number()
  .int()
  .refine((n) => n >= 1 && n <= 5, "Hari hanya boleh Senin sampai Jumat");

export const idParamSchema = z.coerce.number().int().positive("ID tidak valid");

export const scheduleVersionSchema = z.enum(["A", "B", "EXAM"], {
  errorMap: () => ({ message: "Versi jadwal harus A, B, atau EXAM" }),
});

export const scheduleModeSchema = z.enum(["AUTO", "EXAM", "MANUAL_A", "MANUAL_B"], {
  errorMap: () => ({ message: "Mode jadwal tidak dikenal" }),
});

const optionalDateKey = z
  .union([dateKeySchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

const optionalTime = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((value) => value === "" || timePattern.test(value), "Format jam harus HH:MM");

export const scheduleItemSchema = z
  .object({
    subject: trimmed(120, "Mata pelajaran").min(1, "Mata pelajaran wajib diisi"),
    // Times are optional: the admin form no longer asks for them. They stay
    // accepted so old data and API callers keep working, and so a day can
    // still be ordered by time when it happens to be filled in.
    startTime: optionalTime,
    endTime: optionalTime,
    teacher: optionalText(120, "Nama guru"),
    room: optionalText(60, "Ruang"),
    examDate: optionalDateKey,
  })
  .refine((data) => !data.startTime || !data.endTime || data.startTime < data.endTime, {
    message: "Jam selesai harus lebih lambat dari jam mulai",
    path: ["endTime"],
  });

export const scheduleSettingsSchema = z
  .object({
    mode: scheduleModeSchema,
    examEnabled: z.boolean().default(false),
    examStartDate: optionalDateKey,
    examEndDate: optionalDateKey,
  })
  .refine(
    (data) => !data.examStartDate || !data.examEndDate || data.examStartDate <= data.examEndDate,
    { message: "Tanggal selesai tidak boleh sebelum tanggal mulai", path: ["examEndDate"] },
  );

export const scheduleItemUpdateSchema = scheduleItemSchema;

export const dayDescriptionSchema = z.object({
  description: trimmed(500, "Keterangan hari"),
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1, "Daftar ID kosong"),
});

export const assignmentSchema = z.object({
  subject: trimmed(120, "Mata pelajaran").min(1, "Mata pelajaran wajib diisi"),
  title: trimmed(200, "Judul tugas").min(1, "Judul tugas wajib diisi"),
  description: optionalText(4000, "Deskripsi"),
  assignedDay: z.union([z.coerce.number().int().refine((n) => n >= 1 && n <= 5, "Hari tidak valid"), z.null()]).optional().default(null),
  dueDate: dateKeySchema,
  notes: optionalText(500, "Keterangan"),
  status: z.enum(["active", "completed"]).default("active"),
});

export const assignmentUpdateSchema = assignmentSchema;

export const classSettingsSchema = z.object({
  className: trimmed(120, "Nama kelas").min(1, "Nama kelas wajib diisi"),
  description: trimmed(2000, "Deskripsi"),
  homeroomTeacher: optionalText(120, "Nama wali kelas"),
  academicYear: optionalText(40, "Tahun ajaran"),
  announcement: optionalText(2000, "Pengumuman"),
});

export const loginSchema = z.object({
  username: trimmed(64, "Username").min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi").max(200, "Password terlalu panjang"),
});

export const setupSchema = z.object({
  username: trimmed(64, "Username").min(3, "Username minimal 3 karakter"),
  password: z.string().min(8, "Password minimal 8 karakter").max(200, "Password terlalu panjang"),
});

export type ScheduleItemInput = z.infer<typeof scheduleItemSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type ClassSettingsInput = z.infer<typeof classSettingsSchema>;
export type ScheduleSettingsInput = z.infer<typeof scheduleSettingsSchema>;
