import { cleanHtml } from "@/lib/html";
import type { Newsroom } from "@/lib/newsroom/data";
import { Socials } from "../Socials";

export function NewsroomAboutPage({ nr }: { nr: Newsroom }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">About {nr.account.name}</h1>
      {nr.settings.aboutHtml
        ? <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(nr.settings.aboutHtml) }} />
        : <p className="text-neutral-600">{nr.account.name} has not added an about section yet.</p>}
      <div className="mt-8 border-t border-line pt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Find us</h2>
        {Object.keys(nr.socials).length ? <Socials socials={nr.socials} /> : <p className="text-sm text-neutral-500">No social links listed.</p>}
      </div>
    </div>
  );
}
