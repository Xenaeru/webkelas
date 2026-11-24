"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown, resolveDisplayDay, type DisplayDay } from "@/lib/schedule-day";
import { toJakartaParts } from "@/lib/time";

interface LiveDayState {
  day: DisplayDay;
  mounted: boolean;
  /** Minutes since midnight in Jakarta, refreshed on every tick. */
  nowMinutes: number;
}

/**
 * Ticks once per second, recomputing the Jakarta display day from the shared
 * `resolveDisplayDay` rule. Because the rule is pure, the tick that crosses
 * 19:00 flips the day without a page reload.
 */
export function useLiveDay(initial: DisplayDay): LiveDayState {
  const [day, setDay] = useState<DisplayDay>(initial);
  const [nowMinutes, setNowMinutes] = useState(0);
  const [mounted, setMounted] = useState(false);
  const lastKey = useRef(initial.activeDateKey);

  useEffect(() => {
    setMounted(true);

    const tick = () => {
      const now = new Date();
      const next = resolveDisplayDay(now);
      setDay(next);

      if (next.activeDateKey !== lastKey.current) {
        lastKey.current = next.activeDateKey;
      }

      const parts = toJakartaParts(now);
      setNowMinutes(parts.hour * 60 + parts.minute);
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    // A machine that slept through 19:00 should resync immediately on wake.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { day, mounted, nowMinutes };
}

export function CountdownLabel({ ms, mounted }: { ms: number; mounted: boolean }) {
  return (
    <span className="tabular text-[13px] font-medium" suppressHydrationWarning>
      {mounted ? formatCountdown(ms) : "--:--:--"}
    </span>
  );
}
