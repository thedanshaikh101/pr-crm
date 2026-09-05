"use client";
// True below 768px. SSR-safe: false on the server and on the first client render, then tracks matchMedia.
import { useEffect, useState } from "react";

export function useIsNarrow(maxWidth = 767) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") { mq.addEventListener("change", update); return () => mq.removeEventListener("change", update); }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [maxWidth]);
  return narrow;
}
