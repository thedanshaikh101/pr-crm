"use client";
import { useState } from "react";

/** Copies `text`; when `html` is given and the browser supports rich clipboard items, formatted text is copied too. */
export function CopyButton({ text, html, label, className = "btn" }: { text: string; html?: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  async function copy() {
    try {
      if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setState("done");
    } catch { setState("fail"); }
    setTimeout(() => setState("idle"), 1800);
  }
  return <button type="button" className={className} onClick={copy} aria-live="polite">{state === "done" ? "Copied" : state === "fail" ? "Copy failed" : label}</button>;
}
