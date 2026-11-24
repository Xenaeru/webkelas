import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  getClassSettings,
  getScheduleSettings,
  getStats,
  listAllSchedules,
} from "@/lib/repository";
import { SCHOOL_DAY_NAMES, SCHOOL_DAYS, SCHOOL_DAY_SHORT } from "@/lib/schedule-day";
import { resolveScheduleContext, formatExamPeriod } from "@/lib/schedule-version";
import { todayKey } from "@/lib/assignments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard Admin — X RPL 1",
};

export default async function AdminDashboardPage() {
  const now = new Date();
  const [stats, schedulesByVersion, settings, scheduleSettings] = await Promise.all([
    getStats(todayKey(now)),
    listAllSchedules(),
    getClassSettings(),
    getScheduleSettings(),
  ]);

  const context = resolveScheduleContext(now, scheduleSettings);
  const displayDay = context.displayDay;
  const activeSchedules = schedulesByVersion[context.active.version];
  const examPeriod = formatExamPeriod(scheduleSettings);

  const cards = [
    { label: "Total pelajaran", value: stats.totalScheduleItems, note: `${stats.daysWithSchedule} hari terisi` },
    { label: "Mata pelajaran unik", value: stats.totalSubjects, note: "di Jadwal A & B" },
    { label: "Total tugas", value: stats.totalAssignments, note: `${stats.completedAssignments} selesai` },
    { label: "Tugas aktif", value: stats.activeAssignments, note: "belum selesai" },
    { label: "Lewat deadline", value: stats.overdueAssignments, note: "perlu perhatian", alert: stats.overdueAssignments > 0 },
    { label: "Hari aktif publik", value: SCHOOL_DAY_NAMES[displayDay.activeDay], note: displayDay.activeDateLabel, text: true },
  ];

  const versionCards = [
    { version: "A" as const, label: "Jadwal A", hint: "Minggu 1–2" },
    { version: "B" as const, label: "Jadwal B", hint: "Minggu 3–4+" },
    { version: "EXAM" as const, label: "Jadwal Ujian", hint: "Saat mode ujian" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">
          Ringkasan {settings.className}
        </h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Data langsung dari database. Perubahan di sini tampil seketika di halaman publik.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={[
              "rounded-lg border bg-white px-4 py-3.5",
              card.alert ? "border-clay-200 bg-clay-50/40" : "border-paper-300",
            ].join(" ")}
          >
            <p className="text-[10px] font-medium tracking-[0.12em] text-ink-400 uppercase">
              {card.label}
            </p>
            <p
              className={[
                "mt-1.5 font-semibold text-ink-950",
                card.text ? "font-display text-xl" : "tabular text-2xl",
              ].join(" ")}
            >
              {card.value}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-ink-400">{card.note}</p>
          </div>
        ))}
      </div>

      <section
        className={[
          "rounded-xl border px-5 py-5 text-paper-50",
          context.active.examActive ? "border-clay-600 bg-clay-600" : "border-ink-800 bg-ink-950",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-white/50 uppercase">
              Jadwal publik saat ini
            </p>
            <p className="mt-1 font-display text-xl font-semibold">
              {SCHOOL_DAY_NAMES[displayDay.activeDay]} · {displayDay.activeDateLabel}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="tabular rounded-full bg-white/15 px-2 py-0.5 font-semibold tracking-wide uppercase">
                {context.active.label}
              </span>
              {context.active.examActive && examPeriod && <span className="text-white/70">{examPeriod}</span>}
              {!context.active.examActive && (
                <span className="text-white/60">
                  {context.active.source === "AUTO_WEEK"
                    ? "Dipilih otomatis dari minggu kalender"
                    : "Ditetapkan manual oleh admin"}
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Berikutnya</p>
            <p className="text-[13px] text-white/80">
              {SCHOOL_DAY_NAMES[displayDay.nextDay]} · 19.00 WIB
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/60">
          Aturan tetap: Senin–Kamis pukul 19.00 beralih ke hari berikutnya, Jumat pukul 19.00 ke
          Senin, Sabtu–Minggu menampilkan Senin. Minggu 1–2 memakai Jadwal A, minggu 3 dan
          seterusnya memakai Jadwal B. Data jadwal tidak diubah saat hari atau minggu berganti.
        </p>
      </section>

      {context.active.examActive && (
        <section className="rounded-lg border border-clay-200 bg-clay-50 px-4 py-3">
          <p className="text-[12px] font-semibold text-clay-600">Mode ujian sedang aktif</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-clay-600/80">
            Halaman publik menampilkan jadwal ujian, bukan Jadwal {context.active.weekVersion}.
            {examPeriod ? ` Periode: ${examPeriod}.` : " Tanpa batas tanggal — matikan manual setelah ujian selesai."}
          </p>
          <Link
            href="/admin/mode-jadwal"
            className="mt-1.5 inline-block text-[11px] font-medium text-clay-600 underline underline-offset-2"
          >
            Atur mode jadwal →
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink-950">Versi jadwal</h2>
          <Link
            href="/admin/jadwal"
            className="text-[12px] font-medium text-moss-600 underline-offset-4 hover:underline"
          >
            Kelola jadwal →
          </Link>
        </div>

        <ul className="grid gap-2 sm:grid-cols-3">
          {versionCards.map((card) => {
            const list = schedulesByVersion[card.version];
            const count = list.reduce((sum, s) => sum + s.items.length, 0);
            const isLive = context.active.version === card.version;
            return (
              <li key={card.version}>
                <Link
                  href={`/admin/jadwal?version=${card.version}`}
                  className={[
                    "block rounded-lg border bg-white px-4 py-3 transition-colors",
                    isLive ? "border-ink-900" : "border-paper-300 hover:border-ink-400",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink-900">{card.label}</span>
                    {isLive && <Badge tone="moss">aktif</Badge>}
                  </div>
                  <p className="mt-0.5 text-[10px] tracking-wide text-ink-400 uppercase">
                    {card.hint}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    {count === 0 ? "Belum diisi" : `${count} pelajaran`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink-950">
            Status jadwal per hari
            <span className="ml-2 font-normal text-ink-400">
              (Jadwal {context.active.version === "EXAM" ? "Ujian" : context.active.version})
            </span>
          </h2>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCHOOL_DAYS.map((day) => {
            const schedule = activeSchedules.find((s) => s.dayOfWeek === day);
            const count = schedule?.items.length ?? 0;
            const isActive = day === displayDay.activeDay;

            return (
              <li
                key={day}
                className={[
                  "rounded-lg border bg-white px-4 py-3",
                  isActive ? "border-ink-900" : "border-paper-300",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-900">
                    {SCHOOL_DAY_NAMES[day]}
                    {isActive && (
                      <Badge tone="moss" className="ml-2">
                        aktif
                      </Badge>
                    )}
                  </span>
                  <span className="tabular text-[11px] text-ink-400">{SCHOOL_DAY_SHORT[day]}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-500">
                  {count === 0 ? "Belum diisi" : `${count} pelajaran`}
                  {schedule?.description ? " · ada keterangan" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/jadwal?version=A", title: "Jadwal A", desc: "Dipakai minggu 1–2." },
          { href: "/admin/jadwal?version=B", title: "Jadwal B", desc: "Dipakai minggu 3 dan seterusnya." },
          { href: "/admin/jadwal?version=EXAM", title: "Jadwal Ujian", desc: "Tampil saat mode ujian aktif." },
          { href: "/admin/mode-jadwal", title: "Mode Jadwal", desc: "Otomatis, manual A/B, atau mode ujian." },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-lg border border-paper-300 bg-white px-4 py-3.5 transition-colors hover:border-ink-500"
          >
            <p className="text-[13px] font-semibold text-ink-950">{link.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{link.desc}</p>
            <span
              aria-hidden
              className="mt-2 inline-block text-[12px] text-ink-400 transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/admin/tugas", title: "Kelola Tugas", desc: "Atur tugas, deadline, deskripsi, dan status. Tidak terpengaruh mode jadwal." },
          { href: "/admin/pengaturan", title: "Pengaturan Kelas", desc: "Ubah nama kelas, wali kelas, tahun ajaran, pengumuman." },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-lg border border-paper-300 bg-white px-4 py-3.5 transition-colors hover:border-ink-500"
          >
            <p className="text-[13px] font-semibold text-ink-950">{link.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{link.desc}</p>
            <span
              aria-hidden
              className="mt-2 inline-block text-[12px] text-ink-400 transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
