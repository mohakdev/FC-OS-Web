"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEMES,
  type ThemeId,
  themeClassName,
} from "@/lib/themes";

type ActiveThemeValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ActiveThemeContext = createContext<ActiveThemeValue | null>(null);

export function ActiveThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeId;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);

    // The class lives on <body>, which the root layout renders — React won't
    // re-render it from here, so swap it by hand. Everything else (including
    // Radix portals) sits inside <body>, so the new vars reach the whole tree.
    const body = document.body;
    for (const candidate of THEMES) {
      body.classList.toggle(
        themeClassName(candidate.id),
        candidate.id === next,
      );
    }

    // biome-ignore lint/suspicious/noDocumentCookie: the suggested CookieStore API is still Chromium-only
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ActiveThemeContext.Provider value={value}>
      {children}
    </ActiveThemeContext.Provider>
  );
}

/** Falls back to the default outside a provider so components that may render
 *  in isolation (tests, storybook-ish previews) don't have to guard. */
export function useActiveTheme(): ActiveThemeValue {
  const context = useContext(ActiveThemeContext);
  if (context) return context;
  return { theme: DEFAULT_THEME, setTheme: () => {} };
}
