import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { deadlineTone, describeDeadline, formatDueDate } from "@/lib/assignments";
import { SCHOOL_DAY_NAMES } from "@/lib/schedule-day";
import type { Assignment } from "@/lib/repository";
import { isSchoolWeekday } from "@/lib/schedule-day";

export function AssignmentList({
  assignments,
  emptyTitle = "Belum ada tugas",
  emptyDescription = "Belum ada tugas yang tercatat. Daftar tugas akan muncul di sini setelah admin menambahkannya.",
}: {
  assignments: Assignment[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (assignments.length === 0) {
    return <EmptyState icon="✓" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {assignments.map((assignment) => {
        const deadline = describeDeadline(assignment);
        const isCompleted = assignment.status === "completed";

        return (
          <li
            key={assignment.id}
            className={[
              "card-lift group relative rounded-lg border bg-white px-4 py-3.5",
              isCompleted ? "border-paper-200" : "border-paper-300",
              deadline.state === "overdue" ? "border-l-2 border-l-clay-500" : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-[0.12em] text-moss-600 uppercase">
                    {assignment.subject}
                  </span>
                  {isCompleted && <Badge tone="moss">Selesai</Badge>}
                  {deadline.state === "overdue" && <Badge tone="clay">Terlambat</Badge>}
                </div>

                <p
                  className={[
                    "mt-1 text-[15px] leading-snug font-medium text-ink-900",
                    isCompleted ? "line-through decoration-ink-400 decoration-1" : "",
                  ].join(" ")}
                >
                  {assignment.title}
                </p>

                {assignment.description && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
                    {assignment.description}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
                  <span>
                    Deadline{" "}
                    <span className="font-medium text-ink-700">{formatDueDate(assignment.dueDate)}</span>
                  </span>
                  {assignment.assignedDay && isSchoolWeekday(assignment.assignedDay) && (
                    <>
                      <span aria-hidden>·</span>
                      <span>Diberikan {SCHOOL_DAY_NAMES[assignment.assignedDay]}</span>
                    </>
                  )}
                </div>

                {assignment.notes && (
                  <p className="mt-2 rounded-md bg-paper-100 px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-500">
                    {assignment.notes}
                  </p>
                )}
              </div>

              <Badge tone={deadlineTone(deadline.state)} className="shrink-0">
                {deadline.label}
              </Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
