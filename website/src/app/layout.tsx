import type { Metadata, Viewport } from "next";
import { Syne, Work_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const displayFont = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const bodyFont = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Luma Events — Safe event operations from your AI workspace",
    template: "%s | Luma Events",
  },
  description:
    "A community-built MCP server for managing Luma events, guests, tickets, hosts, invitations, and registration insights from Codex, Cursor, and other AI clients.",
  keywords: [
    "Luma",
    "MCP server",
    "event management",
    "Codex",
    "Cursor",
    "Claude Code",
  ],
  authors: [{ name: "Felix Jumason", url: "https://github.com/Blackie360" }],
  creator: "Felix Jumason",
  openGraph: {
    type: "website",
    title: "Luma Events — Your calendar, now agent-operable",
    description:
      "Plan, inspect, and safely operate your Luma calendar without leaving your AI workspace.",
    siteName: "Luma Events",
  },
  twitter: {
    card: "summary_large_image",
    title: "Luma Events — Your calendar, now agent-operable",
    description:
      "A confirmation-first MCP server for serious Luma event operations.",
  },
  category: "technology",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070A12",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} dark antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
