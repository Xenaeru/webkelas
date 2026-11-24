import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "moss" | "clay" | "amber" | "outline";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-paper-200 text-ink-700",
    moss: "bg-moss-50 text-moss-700 border border-moss-200",
    clay: "bg-clay-50 text-clay-600 border border-clay-200",
    amber: "bg-[#fdf6e3] text-amber-ink border border-[#efdfb4]",
    outline: "border border-paper-300 text-ink-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
