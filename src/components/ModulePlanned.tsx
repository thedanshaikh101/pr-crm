import Link from "next/link";

/** Placeholder for modules scheduled in later build steps. Data model and nav are wired; screens are not. */
export function ModulePlanned({ name, step, includes }: { name: string; step: number; includes: string[] }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-1 text-sm text-neutral-600">Build step {step}. The tables for this module exist in the database; the screens come next.</p>
      <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700">{includes.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="mt-4 text-xs text-neutral-500">Track progress in <code>TODO.md</code>. <Link href="/contacts" className="underline">Back to Contacts</Link></p>
    </div>
  );
}
