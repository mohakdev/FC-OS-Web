import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// Fonts are vendored (latin subset, straight from Google Fonts) rather than pulled
// via `next/font/google`, which fetches them over the network at build time. The
// self-hosted box builds on the campus wifi, which regularly blocks outbound HTTPS —
// that turned every deploy into a coin flip. Vendoring makes the build offline-safe.
// See docs/SELF_HOSTING.md.
const serif = localFont({
  src: "./fonts/instrument-serif-latin-400.woff2",
  variable: "--font-serif",
  weight: "400",
  style: "normal",
  display: "swap",
});

const geist = localFont({
  src: "./fonts/geist-latin-variable.woff2",
  variable: "--font-sans",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.BETTER_AUTH_URL ??
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FC OS",
  description: "The Founders Operating System",
  openGraph: {
    title: "FC OS",
    description: "The Founders Operating System",
    url: siteUrl,
    siteName: "FC OS",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "FC OS",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FC OS",
    description: "The Founders Operating System",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        "h-full",
        "antialiased",
        serif.variable,
        geist.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
