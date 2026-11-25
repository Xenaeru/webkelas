"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CountdownLabel, useLiveDay } from "@/components/public/use-live-day";
import { ScheduleTimeline } from "@/components/public/schedule-timeline";
import { AssignmentList } from "@/components/public/assignment-list";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  SCHOOL_DAY_NAMES,
  SCHOOL_DAY_SHORT,
  SCHOOL_DAYS,
  type SchoolWeekday,
} from "@/lib/schedule-day";
import {
  resolveActiveSchedule,
  formatExamPeriod,
  type ScheduleContext,
  type ScheduleVersion,
} from "@/lib/schedule-version";
import {
  assignmentsForDay,
  daysUntil,
  sortAssignments,
} from "@/lib/assignments";
import type {
  Assignment,
  ClassSettings,
  DailySchedule,
  ScheduleSettings,
} from "@/lib/repository";

interface JadwalClientProps {
  initialContext: ScheduleContext;
  schedulesByVersion: Record<ScheduleVersion, DailySchedule[]>;
  initialSchedules: DailySchedule[];
  scheduleSettings: ScheduleSettings;
  assignments: Assignment[];
  settings: ClassSettings;
}

export function JadwalClient({
  initialContext,
  schedulesByVersion,
  initialSchedules,
  scheduleSettings,
  assignments,
  settings,
}: JadwalClientProps) {
  const { day, mounted, nowMinutes: liveMinutes } = useLiveDay(initialContext.displayDay);
  const [selected, setSelected] = useState<SchoolWeekday | null>(null);

  // Recompute the variant on every tick: crossing 19:00, a week boundary or a
  // month boundary may change which schedule applies.
  const active = useMemo(
    () => (mounted ? resolveActiveSchedule(day, scheduleSettings) : initialContext.active),
    [mounted, day, scheduleSettings, initialContext.active],
  );

  const schedules = mounted ? schedulesByVersion[active.version] : initialSchedules;
  const examActive = active.examActive;

  const activeDay = day.activeDay;
  const viewingDay: SchoolWeekday = selected ?? activeDay;
  const isFollowingAuto = selected === null;
  const isActiveBySystem = viewingDay === activeDay;

  const nowMinutes = mounted ? liveMinutes : null;

  const schedule = schedules.find((s) => s.dayOfWeek === viewingDay) ?? null;
  const items = schedule?.items ?? [];

  const examIsEmpty =
    examActive && schedules.every((s) => s.items.length === 0);

  const sorted = useMemo(() => sortAssignments(assignments), [assignments]);
  const dayAssignments = useMemo(() => assignmentsForDay(sorted, viewingDay), [sorted, viewingDay]);
  const otherAssignments = useMemo(
    () => sorted.filter((a) => a.status === "active" && a.assignedDay !== viewingDay).slice(0, 6),
    [sorted, viewingDay],
  );

  const overdueCount = sorted.filter(
    (a) => a.status === "active" && daysUntil(a.dueDate) < 0,
  ).length;

  const examPeriod = formatExamPeriod(scheduleSettings);

  const handleSelect = (d: SchoolWeekday) => {
    setSelected(d === activeDay ? null : d);
  };

  // The sliding tab pill needs the geometry of the selected column. Measure on
  // mount, on resize, and whenever the selection changes — never on every tick.
  // rects are used rather than offsetLeft so the pill stays correct regardless
  // of the grid's own offset from the tablist origin.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const index = SCHOOL_DAYS.indexOf(viewingDay);
    const node = tabRefs.current[index];
    const list = listRef.current;
    if (!node || !list) {
      setIndicator(null);
      return;
    }
    const nodeBox = node.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const next = {
      left: nodeBox.left - listBox.left,
      width: nodeBox.width,
    };
    setIndicator((prev) =>
      prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5
        ? prev
        : next,
    );
  }, [viewingDay]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);

    // Web fonts land after first paint and change the column widths, which
    // would leave the pill misaligned until the next resize.
    let cancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* Page header */}
      <section className="animate-fade pt-10 pb-8 sm:pt-14">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-semibold text-ink-950 sm:text-4xl">
            {settings.className}
          </h1>
          {settings.academicYear && (
            <span className="text-sm text-ink-400">Tahun Ajaran {settings.academicYear}</span>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-[15px]">
          {settings.description}
        </p>
      </section>

      {/* Which schedule is in use */}
      <section aria-label="Jadwal yang digunakan" className="mb-4">
        <div
          className={[
            "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 transition-colors duration-500",
            examActive
              ? "border-clay-200 bg-clay-50"
              : "border-paper-300 bg-paper-100/70",
          ].join(" ")}
        >
          <span
            className={[
              "flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase transition-colors duration-500",
              examActive ? "text-clay-600" : "text-ink-400",
            ].join(" ")}
          >
            <span
              className={[
                "live-dot",
                examActive ? "bg-clay-500 text-clay-500" : "bg-moss-500 text-moss-500",
              ].join(" ")}
            />
            {examActive ? "Mode ujian" : "Jadwal aktif"}
          </span>
          <span
            className={[
              "tabular text-[13px] font-semibold transition-colors duration-500",
              examActive ? "text-clay-600" : "text-ink-900",
            ].join(" ")}
            suppressHydrationWarning
          >
            {mounted ? active.label : initialContext.active.label}
          </span>

          {examActive && examPeriod && (
            <span className="text-[12px] text-clay-600/80" suppressHydrationWarning>
              {examPeriod}
            </span>
          )}

          {!examActive && (
            <span className="text-[11px] text-ink-400">
              {active.source === "AUTO_WEEK"
                ? "Dipilih otomatis berdasarkan minggu ke-" + active.weekOfMonth + " dalam bulan."
                : "Ditetapkan manual oleh admin."}
            </span>
          )}
        </div>
      </section>

      {/* Active day + countdown */}
      <section
        aria-label="Informasi hari aktif"
        className={[
          "mb-8 overflow-hidden rounded-xl border text-paper-50",
          examActive ? "border-clay-700 bg-clay-700" : "border-ink-800 bg-ink-950",
        ].join(" ")}
      >
        <div
          className={[
            "grid gap-px sm:grid-cols-[1.3fr_1fr_1fr]",
            examActive ? "bg-clay-600" : "bg-ink-800",
          ].join(" ")}
        >
          <div className={examActive ? "bg-clay-700 px-5 py-5 sm:px-6" : "bg-ink-950 px-5 py-5 sm:px-6"}>
            <div className="flex items-center gap-2">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-white/80" />
              <span className="text-[10px] font-semibold tracking-[0.2em] text-white/60 uppercase">
                {examActive ? "Jadwal ujian" : "Jadwal yang ditampilkan"}
              </span>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-paper-50 sm:text-3xl">
              {SCHOOL_DAY_NAMES[activeDay]}
            </p>
            <p className="mt-1 text-[13px] text-white/65" suppressHydrationWarning>
              {mounted ? day.activeDateLabel : initialContext.displayDay.activeDateLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {examActive ? (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white uppercase">
                  Mode ujian aktif
                </span>
              ) : isFollowingAuto ? (
                <span className="rounded-full bg-ink-800 px-2.5 py-1 text-[10px] font-medium tracking-wide text-paper-200 uppercase">
                  {day.isRealToday ? "Hari ini" : "Otomatis"}
                </span>
              ) : (
                <span className="rounded-full bg-ink-800 px-2.5 py-1 text-[10px] font-medium tracking-wide text-paper-200 uppercase">
                  Pilihanmu · {SCHOOL_DAY_NAMES[activeDay]}
                </span>
              )}
            </div>
          </div>

          <div className={examActive ? "bg-clay-700 px-5 py-5 sm:px-6" : "bg-ink-950 px-5 py-5 sm:px-6"}>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-white/60 uppercase">
              Pergantian jadwal
            </span>
            <p className="mt-2 text-[15px] font-medium text-paper-50">
              {SCHOOL_DAY_NAMES[day.nextDay]}
            </p>
            <p className="mt-1 text-[13px] text-white/65" suppressHydrationWarning>
              {mounted ? day.nextDateLabel : initialContext.displayDay.nextDateLabel}
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <CountdownLabel ms={day.msUntilRollover} mounted={mounted} />
              <span className="text-[10px] tracking-[0.12em] text-white/60 uppercase">WIB</span>
            </div>
          </div>

          <div className={examActive ? "bg-clay-700 px-5 py-5 sm:px-6" : "bg-ink-950 px-5 py-5 sm:px-6"}>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-white/60 uppercase">
              Ringkasan
            </span>
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] text-white/60">
                  {examActive ? "Sesi ujian" : "Pelajaran"}
                </dt>
                <dd className="tabular text-lg font-semibold text-paper-50">{items.length}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-white/60">Tugas hari ini</dt>
                <dd className="tabular text-lg font-semibold text-paper-50">
                  {dayAssignments.filter((a) => a.status === "active").length}
                </dd>
              </div>
            </dl>
            {overdueCount > 0 && (
              <p className="mt-2 text-[11px] text-white/70">
                {overdueCount} tugas melewati deadline
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Day tabs */}
      <nav aria-label="Pilih hari" className="mb-6">
        <div className="flex items-center justify-between gap-3 pb-2">
          <h2 className="text-lg font-semibold text-ink-900">Navigasi hari</h2>
          {selected !== null && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[12px] font-medium text-moss-600 underline-offset-4 hover:underline"
            >
              Kembali ke hari aktif
            </button>
          )}
        </div>

        <div
          ref={listRef}
          role="tablist"
          aria-label="Hari sekolah"
          className="relative grid grid-cols-5 gap-1.5 sm:gap-2"
        >
          {/* Sliding pill. All five columns are equal width, so a single
              translate + width measurement covers every case; the transition
              is transform-only, which the compositor can run. */}
          {indicator && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 -z-0 h-full rounded-lg border border-ink-900 bg-ink-900 shadow-[0_8px_20px_-16px_rgba(11,15,20,0.9)]"
              style={{
                width: `${indicator.width}px`,
                transform: `translateX(${indicator.left}px)`,
                transition: "transform 0.35s var(--ease-out-quint)",
              }}
            />
          )}

          {SCHOOL_DAYS.map((d) => {
            const isActive = d === activeDay;
            const isSelected = d === viewingDay;
            const dayCount = schedules.find((s) => s.dayOfWeek === d)?.items.length ?? 0;

            return (
              <button
                key={d}
                ref={(node) => {
                  if (node) tabRefs.current[SCHOOL_DAYS.indexOf(d)] = node;
                }}
                role="tab"
                type="button"
                aria-selected={isSelected}
                aria-controls="panel-jadwal"
                onClick={() => handleSelect(d)}
                className={[
                  "press relative z-10 flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5",
                  isSelected
                    ? "border-transparent text-paper-50"
                    : "border-paper-300 bg-white text-ink-700 hover:border-ink-500 hover:bg-paper-100",
                ].join(" ")}
              >
                <span className="text-[13px] font-semibold sm:text-sm">{SCHOOL_DAY_SHORT[d]}</span>
                <span
                  className={[
                    "hidden text-[10px] transition-colors duration-300 sm:block",
                    isSelected ? "text-paper-200/80" : "text-ink-400",
                  ].join(" ")}
                >
                  {dayCount > 0 ? `${dayCount} ${examActive ? "sesi" : "pelajaran"}` : "kosong"}
                </span>
                {isActive && (
                  <span
                    aria-label="Hari aktif otomatis"
                    className={[
                      "live-dot absolute top-1.5 right-1.5",
                      isSelected ? "bg-moss-200 text-moss-200" : "bg-moss-500 text-moss-500",
                    ].join(" ")}
                  />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-ink-400">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-moss-500 align-middle" />
          Titik hijau menandai hari yang sedang aktif menurut waktu WIB.
        </p>
      </nav>

      {/* Schedule panel */}
      <section
        id="panel-jadwal"
        role="tabpanel"
        aria-label={`Jadwal hari ${SCHOOL_DAY_NAMES[viewingDay]}`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold text-ink-950">{SCHOOL_DAY_NAMES[viewingDay]}</h2>
            {examActive ? (
              <Badge tone="clay">Jadwal ujian</Badge>
            ) : (
              <Badge tone="outline">Jadwal {active.version}</Badge>
            )}
            {isActiveBySystem && isFollowingAuto && !examActive && (
              <Badge tone="moss">Sedang berjalan</Badge>
            )}
            {!isActiveBySystem && <Badge tone="outline">Pilihan manual</Badge>}
          </div>
          <span className="tabular text-[12px] text-ink-400">
            {items.length} {examActive ? "sesi ujian" : "mata pelajaran"}
          </span>
        </div>

        {examIsEmpty ? (
          <div className="rounded-lg border border-clay-200 bg-clay-50 px-4 py-6">
            <p className="text-[13px] font-semibold text-clay-600">Jadwal ujian belum diisi</p>
            <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-clay-600/80">
              Mode ujian sedang aktif, tetapi admin belum mengisi jadwal ujian. Jadwal reguler
              sengaja tidak ditampilkan agar tidak menyesatkan. Silakan hubungi admin kelas.
            </p>
          </div>
        ) : (
          <div key={`${active.version}-${viewingDay}`} className="animate-swap">
            <ScheduleTimeline
              items={items}
              nowMinutes={isActiveBySystem ? nowMinutes : null}
              showNow={isActiveBySystem}
              showRoom={examActive}
            />

            {schedule?.description && (
              <div className="mt-4 flex gap-3 rounded-lg border border-paper-300 bg-paper-100/80 px-4 py-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-paper-50"
                >
                  i
                </span>
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-ink-400 uppercase">
                    Keterangan hari {SCHOOL_DAY_NAMES[viewingDay]}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                    {schedule.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Assignments — never affected by schedule mode */}
      <section aria-labelledby="judul-tugas" className="mt-14">
        <div
          data-reveal
          className="mb-4 flex flex-wrap items-end justify-between gap-2 border-t border-paper-200 pt-8"
        >
          <div>
            <h2 id="judul-tugas" className="text-2xl font-semibold text-ink-950">
              Daftar Tugas
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">
              Tugas diurutkan berdasarkan deadline terdekat. Tugas tetap tersimpan saat jadwal
              berganti hari maupun saat mode ujian aktif.
            </p>
          </div>
          <span className="tabular text-[12px] text-ink-400">
            {sorted.filter((a) => a.status === "active").length} tugas aktif
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div data-reveal>
            <h3 className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-ink-400 uppercase">
              Diberikan hari {SCHOOL_DAY_NAMES[viewingDay]}
            </h3>
            <AssignmentList
              assignments={dayAssignments}
              emptyTitle={`Tidak ada tugas untuk hari ${SCHOOL_DAY_NAMES[viewingDay]}`}
              emptyDescription="Belum ada tugas yang diberikan pada hari ini. Coba lihat daftar tugas lainnya di samping."
            />
          </div>

          <aside data-reveal style={{ "--reveal-delay": "80ms" } as CSSProperties}>
            <h3 className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-ink-400 uppercase">
              Tugas aktif lainnya
            </h3>
            {otherAssignments.length === 0 ? (
              <EmptyState
                icon="✓"
                title="Tidak ada tugas lain"
                description="Semua tugas aktif sudah ditampilkan."
              />
            ) : (
              <ul className="divide-y divide-paper-200 border-y border-paper-200">
                {otherAssignments.map((assignment) => {
                  const overdue = daysUntil(assignment.dueDate) < 0;
                  return (
                    <li
                      key={assignment.id}
                      className="row-lift flex items-start gap-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className={[
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          overdue ? "bg-clay-500" : "bg-ink-400",
                        ].join(" ")}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink-900">
                          {assignment.title}
                        </p>
                        <p className="text-[11px] text-ink-400">
                          {assignment.subject} · {assignment.dueDate}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
