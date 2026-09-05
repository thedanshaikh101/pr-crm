"use client";
// Keep Tab inside a dialog while it is open, close on Escape, and return focus to whatever
// opened it when it closes. Mark the element that should get initial focus with data-autofocus.
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onClose?: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement);
    const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? el;
    if (first === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    const raf = requestAnimationFrame(() => first.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); el.focus(); return; }
      const idx = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (idx === -1 || idx === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [active, ref]);
}
