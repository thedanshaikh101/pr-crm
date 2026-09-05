"use client";
// URL input plus a "pick from library" select that fills it in.
import { useState } from "react";

export function ImagePicker({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: { id: string; name: string; url: string }[] }) {
  const [value, setValue] = useState(defaultValue);
  const id = `ip-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex flex-wrap gap-2">
        <input id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} className="input flex-1 min-w-[14rem]" placeholder="https://…" />
        <select className="input w-52" aria-label={`Pick ${label} from library`} value="" onChange={(e) => { const o = options.find((x) => x.id === e.target.value); if (o) setValue(o.url); }}>
          <option value="">Pick from library…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {value && <button type="button" className="btn" onClick={() => setValue("")}>Clear</button>}
      </div>
      {value && <img src={value} alt="" className="mt-2 max-h-20 rounded border border-line bg-neutral-50 object-contain" />}
    </div>
  );
}
