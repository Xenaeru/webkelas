"use client";

import { useEffect } from "react";

const SHOWN = "shown";

/**
 * Arms `html.js-reveal` and reveals `[data-reveal]` elements as they enter the
 * viewport. The arming class is set by an inline script before first paint, so
 * hidden content never flashes; `reveal-live` tells that script the observer is
 * running, which lets it stand down instead of force-revealing after a timeout.
 */
export function RevealController() {
  useEffect(() => {
    const root = document.documentElement;
    const revealAll = () => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
        el.setAttribute("data-reveal", SHOWN);
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      root.classList.add("reveal-live");
      revealAll();
      return;
    }

    root.classList.add("reveal-live");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", SHOWN);
          observer.unobserve(entry.target);
        }
      },
      // Reveal a touch before the element is fully in view so the motion reads
      // as the page settling, not as content arriving late.
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );

    let frame = 0;
    const scan = () => {
      frame = 0;
      for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
        if (el.getAttribute("data-reveal") === SHOWN) continue;
        if (el.dataset.revealWatched === "1") continue;
        el.dataset.revealWatched = "1";
        observer.observe(el);
      }
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(scan);
    };

    scan();

    // Panels mount and swap on tab changes; pick those up without rescanning
    // the whole document on every keystroke or countdown tick.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const element = node as HTMLElement;
          if (element.matches("[data-reveal]") || element.querySelector("[data-reveal]")) {
            schedule();
            return;
          }
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
