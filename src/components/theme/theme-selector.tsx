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
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * `sidebar` renders inside the dashboard shell's SidebarFooter (needs a
 * SidebarProvider above it); `floating` pins itself top-right and is what the
 * public routes outside the shell use.
 */
export function ThemeSelector({
  variant = "sidebar",
  className,
}: {
  variant?: "sidebar" | "floating";
  className?: string;
}) {
  const { theme: mode, setTheme: setMode, resolvedTheme } = useTheme();
  const { theme, setTheme } = useActiveTheme();

  // The mode axis lives in localStorage, so the server can't know it — read it
  // only after mount to keep the markup stable. The theme axis needs no such
  // guard: it is server-rendered from the cookie.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const swatchMode = mounted && resolvedTheme === "light" ? "light" : "dark";

  const menu = (
    <DropdownMenuContent
      align={variant === "sidebar" ? "start" : "end"}
      side={variant === "sidebar" ? "right" : "bottom"}
      sideOffset={8}
      className="w-52"
    >
      <DropdownMenuLabel>Mode</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={mounted ? (mode ?? "system") : ""}
        onValueChange={setMode}
      >
        {MODES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon className="size-4 text-muted-foreground" />
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
    </DropdownMenuContent>
  );

  if (variant === "floating") {
    return (
      <div className={cn("fixed top-4 right-4 z-50", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change theme">
              <Palette />
            </Button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    );
  }

  // SidebarMenuButton wraps its child in a <Tooltip>, which renders no DOM node —
  // so it has to be the *outer* asChild here. Putting DropdownMenuTrigger on the
  // outside would hand its props to the Tooltip root and the menu would never open.
  return (
    <DropdownMenu>
      <SidebarMenuButton asChild tooltip="Theme" className={className}>
        <DropdownMenuTrigger>
          <Palette />
          <span>Theme</span>
        </DropdownMenuTrigger>
      </SidebarMenuButton>
      {menu}
    </DropdownMenu>
  );
}
