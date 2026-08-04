"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

import { ActiveThemeProvider } from "@/components/theme/active-theme";
import type { ThemeId } from "@/lib/themes";

/**
 * Two independent axes:
 *  - mode  → `next-themes`, `dark` class on <html>, persisted in localStorage
 *            (its inline script runs before paint, so no flash).
 *  - theme → `ActiveThemeProvider`, `theme-*` class on <body>, persisted in a
 *            cookie the root layout reads server-side (so also no flash).
 */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeId;
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ActiveThemeProvider initialTheme={initialTheme}>
        {children}
      </ActiveThemeProvider>
    </NextThemesProvider>
  );
}
