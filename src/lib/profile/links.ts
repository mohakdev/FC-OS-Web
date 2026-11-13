import { Globe } from "lucide-react";
import type { ComponentType } from "react";
import {
  FaBehance,
  FaDribbble,
  FaFacebook,
  FaFigma,
  FaGithub,
  FaGitlab,
  FaInstagram,
  FaLinkedin,
  FaMedium,
  FaSpotify,
  FaThreads,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";

// Icon + label for a member's profile link, derived from the hostname. lucide
// (the app's icon set) ships no brand logos, so known platforms use react-icons'
// FontAwesome brands. Anything not listed (a personal site, a blog, a startup's
// page) gets a globe and its bare hostname, e.g. "myportfolio.dev".

type IconType = ComponentType<{ className?: string }>;

const PLATFORMS: { hosts: string[]; label: string; icon: IconType }[] = [
  { hosts: ["linkedin.com", "lnkd.in"], label: "LinkedIn", icon: FaLinkedin },
  { hosts: ["github.com"], label: "GitHub", icon: FaGithub },
  { hosts: ["gitlab.com"], label: "GitLab", icon: FaGitlab },
  { hosts: ["x.com", "twitter.com"], label: "X", icon: FaXTwitter },
  { hosts: ["instagram.com"], label: "Instagram", icon: FaInstagram },
  { hosts: ["threads.net", "threads.com"], label: "Threads", icon: FaThreads },
  { hosts: ["youtube.com", "youtu.be"], label: "YouTube", icon: FaYoutube },
  { hosts: ["behance.net"], label: "Behance", icon: FaBehance },
  { hosts: ["dribbble.com"], label: "Dribbble", icon: FaDribbble },
  { hosts: ["figma.com"], label: "Figma", icon: FaFigma },
  { hosts: ["medium.com"], label: "Medium", icon: FaMedium },
  { hosts: ["facebook.com", "fb.com"], label: "Facebook", icon: FaFacebook },
  { hosts: ["spotify.com"], label: "Spotify", icon: FaSpotify },
];

export type LinkMeta = { icon: IconType; label: string; href: string };

/** Hostname without `www.`, or null if `url` doesn't parse. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function linkMeta(url: string): LinkMeta | null {
  const host = hostOf(url);
  if (!host) return null;
  // Match the host itself or any subdomain (in.linkedin.com, m.youtube.com),
  // never a lookalike suffix (notgithub.com).
  const platform = PLATFORMS.find((p) =>
    p.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
  return platform
    ? { icon: platform.icon, label: platform.label, href: url }
    : { icon: Globe, label: host, href: url };
}
