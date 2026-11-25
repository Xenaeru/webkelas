"use client";

import { useEffect, useRef } from "react";

/**
 * Thin reading-progress rule pinned under the header. Driven by a scroll
 * listener rather than a CSS scroll-timeline because support is still uneven
 * and the cost here is one transform write per frame.
 */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.display = "none";
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${ratio})`;
      el.style.opacity = ratio > 0.002 ? "1" : "0";
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-px">
      <div
        ref={bar}
        className="h-full origin-left bg-moss-600/70 opacity-0"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
