import sanitize from "sanitize-html";

/** Rich text from the editor (releases, boilerplates, newsroom blocks). Strips scripts and event handlers. */
export function cleanHtml(html: string) {
  return sanitize(html ?? "", {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "img", "hr", "table", "thead", "tbody", "tr", "th", "td", "span", "div", "figure", "figcaption", "pre", "code"],
    allowedAttributes: { a: ["href", "target", "rel", "title"], img: ["src", "alt", "width", "height", "title"], "*": ["style", "class"] },
    allowedSchemes: ["http", "https", "mailto", "tel", "data"],
    allowedStyles: { "*": { "text-align": [/^left$|^right$|^center$/], "font-weight": [/^bold$/], color: [/^#[0-9a-f]{3,8}$/i] } },
    transformTags: { a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }, true) },
  });
}

export function stripTags(html: string) {
  return sanitize(html ?? "", { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function excerpt(html: string, n = 160) {
  const t = stripTags(html);
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t;
}
