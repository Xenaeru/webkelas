import type { Metadata } from "next";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { JadwalClient } from "@/components/public/jadwal-client";
import {
  getClassSettings,
  getScheduleSettings,
  listAllSchedules,
  listAssignments,
} from "@/lib/repository";
import { resolveScheduleContext } from "@/lib/schedule-version";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jadwal & Tugas — X RPL 1",
  description:
    "Jadwal pelajaran Senin sampai Jumat dan daftar tugas Kelas X RPL 1, dengan jadwal A/B per minggu dan mode jadwal ujian.",
};

export default async function JadwalPage() {
  const [settings, schedulesByVersion, assignments, scheduleSettings] = await Promise.all([
    getClassSettings(),
    listAllSchedules(),
    listAssignments(),
    getScheduleSettings(),
  ]);

  const context = resolveScheduleContext(new Date(), scheduleSettings);
  const initialSchedules = schedulesByVersion[context.active.version];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader active="jadwal" />
      <main className="flex-1">
        <JadwalClient
          initialContext={context}
          schedulesByVersion={schedulesByVersion}
          initialSchedules={initialSchedules}
          scheduleSettings={scheduleSettings}
          assignments={assignments}
          settings={settings}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
