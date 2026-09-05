"use client";
import { useEffect } from "react";

/** Records one pageview per browser per hour. The bot and cookie checks live in the API route. */
export function PageviewPing({ releaseId }: { releaseId: string }) {
  useEffect(() => {
    if (document.cookie.split(/;\s*/).some((c) => c.startsWith(`pv_${releaseId}=`))) return;
    fetch("/api/newsroom/pageview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId, referrer: document.referrer || null }), keepalive: true }).catch(() => {});
  }, [releaseId]);
  return null;
}
