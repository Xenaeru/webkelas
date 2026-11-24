"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CountdownLabel, useLiveDay } from "@/components/public/use-live-day";
import { SCHOOL_DAY_NAMES } from "@/lib/schedule-day";
import { resolveActiveSchedule, type ScheduleContext } from "@/lib/schedule-version";
import type { ClassSettings, DailySchedule, ScheduleSettings } from "@/lib/repository";
import { formatDateId } from "@/lib/time";

export function HomeActiveDay({
  context,
  activeSchedule,
  settings,
  scheduleSettings,
}: {
  context: ScheduleContext;
  activeSchedule: DailySchedule | null;
  settings: ClassSettings;
  scheduleSettings: ScheduleSettings;
}) {
  const { day, mounted } = useLiveDay(context.displayDay);

  // Recompute live so a 19:00 rollover or a new week/month picks the right variant.
  const active = useMemo(
    () => (mounted ? resolveActiveSchedule(day, scheduleSettings) : context.active),
    [mounted, day, scheduleSettings, context.active],
  );

  const activeDay = day.activeDay;
  const examActive = active.examActive;

  // When the clock rolls over, prefer the server-rendered schedule only if it
  // still matches; otherwise show the new day's identity without stale items.
  const schedule =
    activeSchedule && activeSchedule.dayOfWeek === activeDay ? activeSchedule : null;
  const preview = schedule?.items.slice(0, 4) ?? [];

  return (
    <div className="animate-rise lg:pl-4">
      <div className="overflow-hidden rounded-xl border border-paper-300 bg-white shadow-[0_24px_60px_-48px_rgba(11,15,20,0.5)]">
        <div className="flex items-center justify-between gap-2 border-b border-paper-200 bg-paper-100/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-moss-500" />
            <span className="text-[10px] font-semibold tracking-[0.2em] text-ink-500 uppercase">
              {examActive ? "Mode ujian aktif" : "Jadwal tampil sekarang"}
            </span>
          </div>
          <span className="tabular shrink-0 text-[11px] text-ink-400" suppressHydrationWarning>
            {mounted
              ? formatDateId(day.activeDate).split(",")[1]?.trim()
              : context.displayDay.activeDateLabel.split(",")[1]?.trim()}
          </span>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-display text-2xl font-semibold text-ink-950">
              {SCHOOL_DAY_NAMES[activeDay]}
            </p>
            <span
              className="tabular rounded-full border border-paper-300 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-500 uppercase"
              suppressHydrationWarning
            >
              {mounted ? active.label : context.active.label}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-ink-400" suppressHydrationWarning>
            {mounted ? day.activeDateLabel : context.displayDay.activeDateLabel}
          </p>

          {preview.length > 0 ? (
            <ol className="mt-4 divide-y divide-paper-200 border-t border-paper-200">
              {preview.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3 py-2.5">
                  <span className="tabular w-[5.2rem] shrink-0 text-[12px] text-ink-400">
                    {item.startTime}–{item.endTime}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">
                    {item.subject}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-paper-300 px-3 py-6 text-center text-[12px] text-ink-400">
              {examActive ? "Jadwal ujian belum diisi." : "Jadwal hari ini belum diisi."}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-paper-200 pt-3">
            <div className="text-[11px] text-ink-400">
              Pergantian ke{" "}
              <span className="font-medium text-ink-700">{SCHOOL_DAY_NAMES[day.nextDay]}</span>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <CountdownLabel ms={day.msUntilRollover} mounted={mounted} />
                <span className="text-[9px] tracking-[0.12em] uppercase">WIB</span>
              </div>
            </div>
            <Link
              href="/jadwal"
              className="rounded-md border border-paper-300 px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-700 hover:text-ink-950"
            >
              Detail
            </Link>
          </div>
        </div>
      </div>

      {settings.homeroomTeacher && (
        <p className="mt-3 px-1 text-[11px] text-ink-400">
          Wali kelas: <span className="text-ink-700">{settings.homeroomTeacher}</span>
        </p>
      )}
    </div>
  );
}
