const STYLES: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700", SCHEDULED: "bg-amber-50 text-warn", LIVE: "bg-green-50 text-good", ARCHIVED: "bg-neutral-100 text-neutral-400",
  QUEUED: "bg-amber-50 text-warn", SENDING: "bg-accentSoft text-accent", SENT: "bg-green-50 text-good", CANCELLED: "bg-red-50 text-bad", FAILED: "bg-red-50 text-bad",
  PENDING: "bg-amber-50 text-warn", VERIFIED: "bg-green-50 text-good",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${STYLES[status] ?? "bg-neutral-100 text-neutral-700"}`}>{status.toLowerCase()}</span>;
}

export function ClientDot({ client }: { client: { name: string; color: string } | null | undefined }) {
  if (!client) return <span className="text-xs text-neutral-400">No client</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: client.color }} aria-hidden />{client.name}</span>;
}
