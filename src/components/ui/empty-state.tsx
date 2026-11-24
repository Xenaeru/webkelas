import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon = "—",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-paper-300 bg-white/60 px-6 py-14 text-center">
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full border border-paper-300 bg-paper-100 text-lg text-ink-400"
      >
        {icon}
      </span>
      <h3 className="text-lg text-ink-900">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      {action}
    </div>
  );
}
