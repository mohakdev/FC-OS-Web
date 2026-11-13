// The colour-theme axis of the theme selector. Independent of light/dark, which
// `next-themes` owns via the `dark` class on <html>; this one lands as a
// `theme-<id>` class on <body>. Palettes live in src/styles/globals.css.
//
// No "use client" — the root layout reads the cookie server-side so the first
// paint is already on the right palette.

export type ThemeId = "fc-green" | "neutral";

export type Theme = {
  id: ThemeId;
  label: string;
  // The theme's `--primary`, used for the swatch dot in the menu. Hardcoded
  // rather than read off a CSS var because every row has to show its own colour
  // while the *active* theme's vars are the ones in scope.
  swatch: { light: string; dark: string };
};

export const THEMES: readonly Theme[] = [
  {
    id: "fc-green",
    label: "FC Green",
    swatch: { light: "oklch(0.49 0.145 146)", dark: "oklch(0.72 0.18 146)" },
  },
  {
    id: "neutral",
    label: "Neutral",
    swatch: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
  },
] as const;

// A cookie naming a removed theme (fc-red, claude, zinc, …) fails isThemeId()
// and falls back to this.
export const DEFAULT_THEME: ThemeId = "fc-green";

/** Cookie, not localStorage: the server needs the theme at render time so the
 *  first paint is correct and so `/` knows whether to emit the hero image. */
export const THEME_COOKIE = "fc-os-theme";

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeId(value: string | undefined | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function themeClassName(theme: ThemeId): string {
  return `theme-${theme}`;
}
