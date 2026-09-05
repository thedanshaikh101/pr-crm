export const NAV: { label: string; href: string; items?: { label: string; href: string; external?: boolean }[] }[] = [
  { label: "Response Desk", href: "/response-desk", items: [
    { label: "Topics", href: "/response-desk/topics" }, { label: "At a glance", href: "/response-desk" },
    { label: "Conversations", href: "/response-desk/conversations" }, { label: "Activities", href: "/response-desk/activities" },
    { label: "Interview Requests", href: "/response-desk/interviews" }, { label: "Statements", href: "/response-desk/statements" },
    { label: "Themes", href: "/response-desk/themes" }, { label: "File Attachments", href: "/response-desk/attachments" },
  ] },
  { label: "Content Hub", href: "/releases", items: [
    { label: "Press Releases", href: "/releases" }, { label: "Newsletters", href: "/newsletters" },
    { label: "Resource Library", href: "/library" }, { label: "Visit Newsroom", href: "/newsroom-preview", external: true },
  ] },
  { label: "Contacts", href: "/contacts", items: [
    { label: "Media Contacts", href: "/contacts" }, { label: "In-Article Search", href: "/contacts/in-article" },
    { label: "My Contacts", href: "/contacts?mine=true" }, { label: "Lists", href: "/lists" }, { label: "Imports", href: "/contacts/imports" },
  ] },
  { label: "Coverage", href: "/coverage" },
  { label: "Planning and Analysis", href: "/planning/calendar", items: [
    { label: "Calendar", href: "/planning/calendar" }, { label: "Charts", href: "/planning/charts" },
    { label: "Your Hard Work", href: "/planning/hard-work" }, { label: "Contact Report", href: "/planning/contact-report" }, { label: "Tag Report", href: "/planning/tag-report" },
  ] },
  { label: "Dashboard", href: "/dashboard" },
];
