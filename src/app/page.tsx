import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { Badge } from "@/components/ui/badge";
import { AssignmentList } from "@/components/public/assignment-list";
import { HomeActiveDay } from "@/components/public/home-active-day";
import { getClassSettings, listAllSchedules, listAssignments, getScheduleSettings } from "@/lib/repository";
import { resolveScheduleContext } from "@/lib/schedule-version";
import { sortAssignments } from "@/lib/assignments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "X RPL 1 — Beranda Kelas",
  description:
    "Beranda Kelas X RPL 1: informasi kelas, jadwal pelajaran hari ini, daftar tugas terbaru, dan pengumuman.",
};

export default async function HomePage() {
  const [settings, schedulesByVersion, assignments, scheduleSettings] = await Promise.all([
    getClassSettings(),
    listAllSchedules(),
    listAssignments(),
    getScheduleSettings(),
  ]);
  const context = resolveScheduleContext(new Date(), scheduleSettings);
  const activeSchedules = schedulesByVersion[context.active.version];
  const sorted = sortAssignments(assignments).filter((a) => a.status === "active").slice(0, 4);
  const activeSchedule = activeSchedules.find((s) => s.dayOfWeek === context.displayDay.activeDay) ?? null;
  const totalItems = schedulesByVersion.A.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader active="beranda" />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-paper-200">
          <div
            aria-hidden
            className="grain pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="animate-rise">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="moss">
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-moss-500" />
                  Kelas aktif
                </Badge>
                {settings.academicYear && <Badge tone="outline">{settings.academicYear}</Badge>}
              </div>

              <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-ink-950 sm:text-6xl">
                {settings.className}
              </h1>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-500 sm:text-base">
                {settings.description}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/jadwal"
                  className="group inline-flex items-center gap-2 rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-medium text-paper-50 transition-all duration-200 hover:bg-ink-800 hover:shadow-[0_10px_24px_-14px_rgba(11,15,20,0.7)]"
                >
                  Lihat jadwal &amp; tugas
                  <span
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
                <span className="text-[12px] text-ink-400">
                  Berganti otomatis tiap <span className="font-medium text-ink-700">19.00 WIB</span>
                </span>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-paper-200 pt-6">
                <div>
                  <dt className="text-[11px] tracking-[0.14em] text-ink-400 uppercase">Pelajaran</dt>
                  <dd className="tabular mt-1 font-display text-2xl font-semibold text-ink-900">
                    {totalItems}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-[0.14em] text-ink-400 uppercase">Tugas aktif</dt>
                  <dd className="tabular mt-1 font-display text-2xl font-semibold text-ink-900">
                    {assignments.filter((a) => a.status === "active").length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-[0.14em] text-ink-400 uppercase">Hari sekolah</dt>
                  <dd className="tabular mt-1 font-display text-2xl font-semibold text-ink-900">5</dd>
                </div>
              </dl>
            </div>

            <HomeActiveDay
              context={context}
              activeSchedule={activeSchedule}
              settings={settings}
              scheduleSettings={scheduleSettings}
            />
          </div>
        </section>

        {/* Announcement */}
        {settings.announcement && (
          <section className="border-b border-paper-200 bg-ink-950 text-paper-50">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-start sm:gap-6 sm:px-8">
              <span className="mt-0.5 shrink-0 text-[10px] font-semibold tracking-[0.2em] text-moss-200 uppercase">
                Pengumuman
              </span>
              <p className="max-w-3xl text-[14px] leading-relaxed text-paper-100">
                {settings.announcement}
              </p>
            </div>
          </section>
        )}

        {/* Assignments preview */}
        <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <h2 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Tugas terbaru</h2>
              <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-500">
                Empat tugas aktif dengan deadline terdekat. Buka halaman jadwal untuk melihat daftar
                lengkap per hari.
              </p>
              <Link
                href="/jadwal"
                className="mt-3 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-moss-600 underline-offset-4 hover:underline"
              >
                Semua tugas
                <span aria-hidden>→</span>
              </Link>

              {settings.homeroomTeacher && (
                <div className="mt-8 rounded-lg border border-paper-300 bg-white px-4 py-3">
                  <p className="text-[10px] tracking-[0.16em] text-ink-400 uppercase">Wali kelas</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">{settings.homeroomTeacher}</p>
                </div>
              )}
            </div>

            <div>
              <AssignmentList
                assignments={sorted}
                emptyTitle="Belum ada tugas aktif"
                emptyDescription="Saat ini tidak ada tugas yang menunggu. Tugas baru akan muncul di sini setelah admin menambahkannya."
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
