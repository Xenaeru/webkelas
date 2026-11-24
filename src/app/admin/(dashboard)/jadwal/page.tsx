import type { Metadata } from "next";
import { JadwalManager } from "@/components/admin/jadwal-manager";
import { listSchedules, getScheduleSettings } from "@/lib/repository";
import { scheduleVersionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kelola Jadwal — Admin X RPL 1",
};

export default async function AdminJadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const params = await searchParams;

  const parsed = scheduleVersionSchema.safeParse(params.version ?? "A");
  const version = parsed.success ? parsed.data : "A";

  // Settings are passed through so the editor can label the active variant.
  const [schedules, scheduleSettings] = await Promise.all([
    listSchedules(version),
    getScheduleSettings(),
  ]);

  return (
    <JadwalManager
      version={version}
      initialSchedules={schedules}
      scheduleSettings={scheduleSettings}
    />
  );
}
