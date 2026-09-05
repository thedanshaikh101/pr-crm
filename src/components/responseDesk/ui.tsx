// Small server-safe building blocks shared by the Response Desk screens.
import Link from "next/link";
import { pillClass, humanize } from "@/lib/responseDesk/labels";
import { slaClass, slaLabel, slaState } from "@/lib/responseDesk/sla";

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${pillClass(status)}`}>{humanize(status)}</span>;
}

export function Deadline({ deadline, status, now }: { deadline: Date | null; status: string; now?: Date }) {
  if (!deadline) return <span className="text-neutral-400">No deadline</span>;
  const state = slaState(deadline, status, now);
  return (
    <span className={slaClass(state)} title={deadline.toLocaleString()}>
      {deadline.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
      <span className="ml-1 text-xs opacity-80">({slaLabel(deadline, status, now)})</span>
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div className="card mt-4 p-10 text-center">
      <p className="mb-1 font-medium">{title}</p>
      {hint && <p className="mb-4 text-sm text-neutral-600">{hint}</p>}
      {action && <Link href={action.href} className="btn btn-primary">{action.label}</Link>}
    </div>
  );
}

export function Fab({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="fixed bottom-6 right-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg" aria-label={label}>+</Link>;
}

export function Card({ title, children, right, className = "" }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

export function Row({ k, val }: { k: string; val: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-neutral-500">{k}</span><span className="text-right">{val || <span className="text-neutral-300">none</span>}</span></div>;
}

export function ThemeChip({ theme }: { theme: { name: string; color: string } | null | undefined }) {
  if (!theme) return <span className="text-neutral-400">No theme</span>;
  return <span className="chip" style={{ background: theme.color + "22", color: theme.color }}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: theme.color }} />{theme.name}</span>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mb-3 rounded-md border border-bad/40 bg-red-50 px-3 py-2 text-sm text-bad" role="alert">{message}</p>;
}

/** Tiny select filter that submits on change without JS by living in a GET form. */
export function FilterSelect({ name, value, options, all }: { name: string; value?: string; options: { value: string; label: string }[]; all: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input w-auto" aria-label={all}>
      <option value="">{all}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Convert a Date to the value a datetime-local input expects (local wall time). */
export function toLocalInput(d: Date | null | undefined) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmt(d: Date | string | null | undefined, style: "date" | "datetime" = "datetime") {
  if (!d) return "";
  const x = new Date(d);
  return style === "date" ? x.toLocaleDateString() : x.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
