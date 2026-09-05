"use client";
// Tiptap editor that submits as a normal form field (hidden input named `name`).
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

export function RichTextEditor({ name, defaultValue = "", placeholder, minHeight = 260, onChange, compact = false }: {
  name: string; defaultValue?: string; placeholder?: string; minHeight?: number; onChange?: (html: string) => void; compact?: boolean;
}) {
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline, Link.configure({ openOnClick: false, autolink: true }), Image, Placeholder.configure({ placeholder: placeholder ?? "Write here…" })],
    content: defaultValue,
    immediatelyRender: false,
    editorProps: { attributes: { class: "prose prose-sm max-w-none focus:outline-none px-3 py-2", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor }) => { const h = editor.getHTML(); setHtml(h); onChange?.(h); },
  });
  useEffect(() => () => { editor?.destroy(); }, [editor]);
  if (!editor) return <div className="rounded-md border border-line bg-white" style={{ minHeight }} />;
  const B = ({ on, active, label, title }: { on: () => void; active?: boolean; label: string; title: string }) => (
    <button type="button" title={title} aria-label={title} aria-pressed={!!active} onMouseDown={(e) => { e.preventDefault(); on(); }} className={`rounded px-1.5 py-0.5 text-xs ${active ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`}>{label}</button>
  );
  const c = editor.chain().focus();
  return (
    <div className="rounded-md border border-line bg-white">
      <div className="flex flex-wrap gap-0.5 border-b border-line px-1 py-1" role="toolbar" aria-label="Formatting">
        <B on={() => c.toggleBold().run()} active={editor.isActive("bold")} label="B" title="Bold" />
        <B on={() => c.toggleItalic().run()} active={editor.isActive("italic")} label="I" title="Italic" />
        <B on={() => c.toggleUnderline().run()} active={editor.isActive("underline")} label="U" title="Underline" />
        {!compact && <>
          <B on={() => c.toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="H2" title="Heading 2" />
          <B on={() => c.toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} label="H3" title="Heading 3" />
          <B on={() => c.toggleBlockquote().run()} active={editor.isActive("blockquote")} label="❝" title="Quote" />
        </>}
        <B on={() => c.toggleBulletList().run()} active={editor.isActive("bulletList")} label="•" title="Bullet list" />
        <B on={() => c.toggleOrderedList().run()} active={editor.isActive("orderedList")} label="1." title="Numbered list" />
        <B on={() => { const url = window.prompt("Link URL", editor.getAttributes("link").href ?? "https://"); if (url === null) return; if (!url) c.unsetLink().run(); else c.extendMarkRange("link").setLink({ href: url }).run(); }} active={editor.isActive("link")} label="🔗" title="Link" />
        {!compact && <B on={() => { const src = window.prompt("Image URL"); if (src) c.setImage({ src }).run(); }} label="🖼" title="Image" />}
        {!compact && <B on={() => c.setHorizontalRule().run()} label="—" title="Divider" />}
        <span className="flex-1" />
        <B on={() => c.undo().run()} label="↶" title="Undo" />
        <B on={() => c.redo().run()} label="↷" title="Redo" />
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
