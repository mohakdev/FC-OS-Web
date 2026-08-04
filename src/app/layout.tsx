import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_THEME,
  isThemeId,
  THEME_COOKIE,
  themeClassName,
} from "@/lib/themes";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read server-side so the very first paint is already on the chosen palette.
  // `next-themes` handles the light/dark half with its own pre-paint script, so
  // <html> carries no mode class here — hence suppressHydrationWarning.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const activeTheme = isThemeId(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        serif.variable,
        geist.variable,
        "font-sans",
      )}
    >
      <body
        className={cn("min-h-full flex flex-col", themeClassName(activeTheme))}
      >
        <ThemeProvider initialTheme={activeTheme}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
