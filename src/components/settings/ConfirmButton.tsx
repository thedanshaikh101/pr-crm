"use client";
// A submit button that asks first. Renders an accessible dialog; on confirm it submits the
// enclosing form with itself as the submitter so name/value pairs still reach the action.
import { useEffect, useId, useRef, useState } from "react";

export function ConfirmButton({ title, message, confirmLabel = "Confirm", className = "btn btn-danger", name, value, disabled, children }: {
  title: string; message: string; confirmLabel?: string; className?: string; name?: string; value?: string; disabled?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button ref={ref} type="submit" name={name} value={value} className={className} disabled={disabled} onClick={(e) => { e.preventDefault(); setOpen(true); }}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className="card w-full max-w-sm p-5 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id={`${id}-t`} className="font-semibold">{title}</h2>
            <p id={`${id}-d`} className="mt-1 text-sm text-neutral-600">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)} autoFocus>Cancel</button>
              <button type="button" className={className} onClick={() => { setOpen(false); const b = ref.current; b?.form?.requestSubmit(b); }}>{confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
