import type { SocialKey } from "@/lib/newsroom/theme";

const LABELS: Record<SocialKey, string> = { website: "Website", x: "X", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };

function Icon({ k }: { k: SocialKey }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  switch (k) {
    case "x": return <svg {...common}><path d="M17.5 3h3l-7.3 8.3L21.8 21h-6.6l-4.6-6-5.3 6H2.2l7.8-8.9L1.8 3h6.7l4.2 5.5L17.5 3zm-1.1 16.2h1.7L7.1 4.7H5.3l11.1 14.5z" /></svg>;
    case "linkedin": return <svg {...common}><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5zM3 9h4v12H3zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21h-4z" /></svg>;
    case "facebook": return <svg {...common}><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z" /></svg>;
    case "instagram": return <svg {...common}><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM21 12c0-1.3 0-2.5-.1-3.7-.2-2.9-1.5-4.9-4.5-5.2C15.2 3 13.9 3 12 3s-3.2 0-4.4.1C4.6 3.4 3.3 5.4 3.1 8.3 3 9.5 3 10.7 3 12s0 2.5.1 3.7c.2 2.9 1.5 4.9 4.5 5.2 1.2.1 2.5.1 4.4.1s3.2 0 4.4-.1c3-.3 4.3-2.3 4.5-5.2.1-1.2.1-2.4.1-3.7zm-1.9 3.6c-.1 2.1-.9 3.4-3.1 3.6-1.1.1-2.3.1-4 .1s-2.9 0-4-.1c-2.2-.2-3-1.5-3.1-3.6C4.8 14.4 4.8 13.3 4.8 12s0-2.4.1-3.6C5 6.3 5.8 5 8 4.8c1.1-.1 2.3-.1 4-.1s2.9 0 4 .1c2.2.2 3 1.5 3.1 3.6.1 1.2.1 2.3.1 3.6s0 2.4-.1 3.6z" /></svg>;
    case "youtube": return <svg {...common}><path d="M23 7.2a2.9 2.9 0 0 0-2-2C19.2 4.7 12 4.7 12 4.7s-7.2 0-9 .5a2.9 2.9 0 0 0-2 2C.5 9 .5 12 .5 12s0 3 .5 4.8a2.9 2.9 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.9 2.9 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8zM9.7 15.1V8.9l6 3.1-6 3.1z" /></svg>;
    default: return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-2.9a15.6 15.6 0 0 0-1.3-5.4A8 8 0 0 1 18.9 11zM12 4c.9 1.2 1.8 3.4 2 7h-4c.2-3.6 1.1-5.8 2-7zM4.3 13h2.8c.1 2 .6 3.9 1.3 5.4A8 8 0 0 1 4.3 13zm2.8-2H4.3a8 8 0 0 1 4.1-5.4c-.7 1.5-1.2 3.4-1.3 5.4zM12 20c-.9-1.2-1.8-3.4-2-7h4c-.2 3.6-1.1 5.8-2 7zm2.7-1.6c.7-1.5 1.2-3.4 1.3-5.4h2.9a8 8 0 0 1-4.2 5.4z" /></svg>;
  }
}

export function Socials({ socials, className = "" }: { socials: Partial<Record<SocialKey, string>>; className?: string }) {
  const entries = Object.entries(socials) as [SocialKey, string][];
  if (!entries.length) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-3 ${className}`} aria-label="Social links">
      {entries.map(([k, url]) => (
        <li key={k}><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" aria-label={LABELS[k]} title={LABELS[k]}><Icon k={k} /><span className="text-sm">{LABELS[k]}</span></a></li>
      ))}
    </ul>
  );
}
