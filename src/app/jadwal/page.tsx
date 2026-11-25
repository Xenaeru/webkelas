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
      <main className="relative flex-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
        >
          <div className="hero-glow -top-20 right-1/4 h-64 w-64 bg-moss-200/40" />
          <div className="hero-glow -top-10 left-1/4 h-52 w-52 bg-clay-200/30 [animation-delay:-9s]" />
        </div>
        <div className="relative">
          <JadwalClient
            initialContext={context}
            schedulesByVersion={schedulesByVersion}
            initialSchedules={initialSchedules}
            scheduleSettings={scheduleSettings}
            assignments={assignments}
            settings={settings}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
