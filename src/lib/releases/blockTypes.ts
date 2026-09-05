/** Newsletter block types and parser. No sanitizer import so client components can use it. */
export type Block =
  | { id: string; type: "heading"; text: string; level?: 1 | 2 | 3 }
  | { id: string; type: "text"; html: string }
  | { id: string; type: "image"; url: string; alt?: string; href?: string }
  | { id: string; type: "release"; releaseId: string }
  | { id: string; type: "button"; label: string; href: string }
  | { id: string; type: "divider" };

export type BlockType = Block["type"];
export const BLOCK_TYPES: BlockType[] = ["heading", "text", "image", "release", "button", "divider"];

export function newBlockId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Accept whatever is stored in the JSON column and return a well-formed block array. */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object" || typeof (b as any).type !== "string") continue;
    const id = String((b as any).id ?? newBlockId());
    const x = b as any;
    switch (x.type) {
      case "heading": out.push({ id, type: "heading", text: String(x.text ?? ""), level: [1, 2, 3].includes(Number(x.level)) ? (Number(x.level) as 1 | 2 | 3) : 2 }); break;
      case "text": out.push({ id, type: "text", html: String(x.html ?? "") }); break;
      case "image": out.push({ id, type: "image", url: String(x.url ?? ""), alt: x.alt ? String(x.alt) : undefined, href: x.href ? String(x.href) : undefined }); break;
      case "release": out.push({ id, type: "release", releaseId: String(x.releaseId ?? "") }); break;
      case "button": out.push({ id, type: "button", label: String(x.label ?? "Read more"), href: String(x.href ?? "") }); break;
      case "divider": out.push({ id, type: "divider" }); break;
    }
  }
  return out;
}
