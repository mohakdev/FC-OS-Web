"use client";

import Image from "next/image";

import { useActiveTheme } from "@/components/theme/active-theme";

/**
 * The landing hero art belongs to the FC Green identity, so every other theme
 * gets that theme's plain `bg-background` instead. Rendered conditionally rather
 * than hidden with CSS: hero-bg.png is ~16 MB and a `display: none` <img> is
 * still fetched. The theme comes from a cookie the server already read, so this
 * agrees with SSR on the first paint.
 */
export function HeroBackground() {
  const { theme } = useActiveTheme();
  if (theme !== "fc-green") return null;

  return (
    <Image
      src="/hero-bg.png"
      alt=""
      fill
      priority
      sizes="100vw"
      className="object-cover object-center opacity-70"
    />
  );
}
