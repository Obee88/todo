import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Todo",
  description: "Multi-user todo list app",
};

// # DECISION: explicit `viewport` export rather than relying solely on
// Next.js App Router's implicit default — Next already injects
// `width=device-width, initial-scale=1` automatically, but making it
// explicit here means it's visible in the codebase, survives a future
// Next.js default change, and is directly testable/reviewable as part of
// "make the UI mobile friendly." Reversal cost: low.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
