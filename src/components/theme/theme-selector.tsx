"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useActiveTheme } from "@/components/theme/active-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * The Mode + Theme radio groups. Render inside any `DropdownMenuContent` or
 * `DropdownMenuSubContent` — the floating picker below and the sidebar's
 * user menu (`NavUser`) both use it.
 */
export function ThemeMenuGroups() {
  const { theme: mode, setTheme: setMode, resolvedTheme } = useTheme();
  const { theme, setTheme } = useActiveTheme();

  // The mode axis lives in localStorage, so the server can't know it — read it
  // only after mount to keep the markup stable. The theme axis needs no such
  // guard: it is server-rendered from the cookie.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const swatchMode = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <>
      <DropdownMenuLabel>Mode</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={mounted ? (mode ?? "system") : ""}
        onValueChange={setMode}
      >
        {MODES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon className="text-muted-foreground" />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />

      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => setTheme(value as ThemeId)}
      >
        {THEMES.map((option) => (
          <DropdownMenuRadioItem key={option.id} value={option.id}>
            <span
              aria-hidden
              className="size-4 rounded-full border border-border"
              style={{ backgroundColor: option.swatch[swatchMode] }}
            />
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/**
 * Floating top-right theme picker for the public routes outside the dashboard
 * shell. Inside the shell, the picker lives in the sidebar's user menu.
 */
export function ThemeSelector({ className }: { className?: string }) {
  return (
    <div className={cn("fixed top-4 right-4 z-50", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Change theme">
            <Palette />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-52">
          <ThemeMenuGroups />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
