import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: {
    default: "NCBD Pro",
    template: "%s · NCBD Pro",
  },
  description: "New College Book Depot & Stationers — PRO counter",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
