"use client";
// Submit button that asks before submitting its form. Works inside server-action forms.
export function ConfirmButton({ message, className = "btn btn-danger", children }: { message: string; className?: string; children: React.ReactNode }) {
  return <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
