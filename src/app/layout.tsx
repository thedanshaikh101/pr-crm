import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Pressdesk", description: "Media contacts, press releases, and coverage in one place." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
