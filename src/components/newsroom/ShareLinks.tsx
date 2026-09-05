import { CopyLinkButton } from "./CopyLinkButton";

export function ShareLinks({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const links = [
    ["X", `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["Email", `mailto:?subject=${t}&body=${u}`],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-neutral-500">Share:</span>
      {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="btn">{label}</a>)}
      <CopyLinkButton url={url} />
    </div>
  );
}
