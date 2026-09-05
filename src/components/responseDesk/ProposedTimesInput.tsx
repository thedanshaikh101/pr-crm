"use client";
// Repeatable datetime-local rows submitted as proposedTimes[].
import { useState } from "react";

function toLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProposedTimesInput({ defaultTimes = [] }: { defaultTimes?: string[] }) {
  const [rows, setRows] = useState<{ key: number; value: string }[]>(() => (defaultTimes.length ? defaultTimes : [""]).map((t, i) => ({ key: i, value: t ? toLocal(t) : "" })));
  const [seq, setSeq] = useState(rows.length);
  return (
    <div>
      <span className="label">Proposed times</span>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2">
            <input type="datetime-local" name="proposedTimes[]" className="input" defaultValue={r.value} aria-label={`Proposed time ${i + 1}`} />
            <button type="button" className="btn px-2" aria-label={`Remove proposed time ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} disabled={rows.length === 1 && !r.value}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn mt-2" onClick={() => { setRows([...rows, { key: seq, value: "" }]); setSeq(seq + 1); }}>Add another time</button>
    </div>
  );
}
