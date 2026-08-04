// The colour-theme axis of the theme selector. Independent of light/dark, which
// `next-themes` owns via the `dark` class on <html>; this one lands as a
// `theme-<id>` class on <body>. Palettes live in src/styles/globals.css.
//
// No "use client" — the root layout reads the cookie server-side so the first
// paint is already on the right palette.

export type ThemeId =
  | "fc-green"
  | "fc-red"
  | "claude"
  | "neutral"
  | "zinc"
  | "slate"
  | "stone"
  | "gray";

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
    id: "fc-red",
    label: "FC Red",
    swatch: { light: "hsl(0 62.8% 40%)", dark: "hsl(0 62.8% 40%)" },
  },
  {
    id: "claude",
    label: "Claude",
    swatch: { light: "#c96442", dark: "#c46849" },
  },
  {
    id: "neutral",
    label: "Neutral",
    swatch: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
  },
  {
    id: "zinc",
    label: "Zinc",
    swatch: {
      light: "oklch(0.21 0.006 285.885)",
      dark: "oklch(0.92 0.004 286.32)",
    },
  },
  {
    id: "slate",
    label: "Slate",
    swatch: {
      light: "oklch(0.208 0.042 265.755)",
      dark: "oklch(0.929 0.013 255.508)",
    },
  },
  {
    id: "stone",
    label: "Stone",
    swatch: {
      light: "oklch(0.216 0.006 56.043)",
      dark: "oklch(0.923 0.003 48.717)",
    },
  },
  {
    id: "gray",
    label: "Gray",
    swatch: {
      light: "oklch(0.21 0.034 264.665)",
      dark: "oklch(0.928 0.006 264.531)",
    },
  },
] as const;

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
