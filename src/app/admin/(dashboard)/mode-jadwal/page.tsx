import type { Metadata } from "next";
import { ScheduleModePanel } from "@/components/admin/schedule-mode-panel";
import { getScheduleSettings } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mode Jadwal — Admin X RPL 1",
};

export default async function AdminModeJadwalPage() {
  const settings = await getScheduleSettings();
  return <ScheduleModePanel initialSettings={settings} />;
}
