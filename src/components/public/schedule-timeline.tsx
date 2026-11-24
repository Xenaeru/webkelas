import type { ScheduleItem } from "@/lib/repository";
import { EmptyState } from "@/components/ui/empty-state";

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function ScheduleTimeline({
  items,
  nowMinutes,
  showNow = false,
  compact = false,
  showRoom = false,
}: {
  items: ScheduleItem[];
  nowMinutes?: number | null;
  showNow?: boolean;
  compact?: boolean;
  showRoom?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="○"
        title="Belum ada pelajaran"
        description="Jadwal untuk hari ini belum diisi. Admin dapat menambahkan mata pelajaran melalui halaman Kelola Jadwal."
      />
    );
  }

  return (
    <ol className="divide-y divide-paper-200 border-y border-paper-200">
      {items.map((item, index) => {
        const start = toMinutes(item.startTime);
        const end = toMinutes(item.endTime);
        const isNow =
          showNow && typeof nowMinutes === "number" && nowMinutes >= start && nowMinutes < end;

        return (
          <li
            key={item.id}
            className={[
              "group relative grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1 px-1 transition-colors sm:grid-cols-[7.5rem_1fr_auto]",
              compact ? "py-3" : "py-4",
              isNow ? "bg-moss-50/70" : "hover:bg-paper-100/70",
            ].join(" ")}
          >
            {isNow && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px] bg-moss-500"
              />
            )}

            <div className="flex items-center gap-2 tabular text-[13px] text-ink-500 sm:flex-col sm:items-start sm:gap-0.5">
              <span className={isNow ? "font-semibold text-moss-700" : "font-medium text-ink-900"}>
                {item.startTime}
              </span>
              <span aria-hidden className="text-ink-400 sm:hidden">
                –
              </span>
              <span className="sm:text-xs">{item.endTime}</span>
            </div>

            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[15px] leading-snug font-medium text-ink-900">
                {item.subject}
                {isNow && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-moss-500 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                    <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
                    Sekarang
                  </span>
                )}
              </p>
              {item.teacher ? (
                <p className="mt-0.5 truncate text-[13px] text-ink-500">{item.teacher}</p>
              ) : (
                <p className="mt-0.5 text-[13px] text-ink-400 italic">Guru belum diisi</p>
              )}

              {(showRoom && (item.room || item.examDate)) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
                  {item.room && (
                    <span className="inline-flex items-center gap-1 rounded border border-paper-300 bg-paper-50 px-1.5 py-0.5">
                      <span className="text-ink-400">Ruang</span>
                      <span className="font-medium text-ink-900">{item.room}</span>
                    </span>
                  )}
                  {item.examDate && (
                    <span className="tabular text-ink-400">{item.examDate}</span>
                  )}
                </p>
              )}
            </div>

            <span className="col-start-2 hidden self-center text-[11px] tracking-[0.14em] text-ink-400 uppercase sm:col-start-3 sm:block">
              {String(index + 1).padStart(2, "0")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
