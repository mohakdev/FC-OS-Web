"use client";

import { EyeIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { exitViewAs, startViewAs } from "@/app/dashboard/view-as-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOMAIN_IDS } from "@/lib/validation/onboarding";

type RoleOption = { id: string; scope: "domain" | "global" };
type ActiveViewAs = {
  role: string;
  domain: string | null;
  expiresAt: number;
};

const capitalize = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const minutesLeft = (expiresAt: number) =>
  Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));

/**
 * Floating dev toolbar for holders of `platform.view_as`. Switches the whole
 * app to one role (+ domain) for up to an hour; see `src/lib/auth/view-as.ts`.
 */
export function ViewAsToolbar({
  roles,
  viewAs,
}: {
  roles: RoleOption[];
  viewAs: ActiveViewAs | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState(viewAs?.role ?? "");
  const [domain, setDomain] = useState(viewAs?.domain ?? "");
  const [left, setLeft] = useState(() =>
    viewAs ? minutesLeft(viewAs.expiresAt) : 0,
  );

  // Tick the countdown; when the switch lapses, refresh so the server (which
  // already ignores the expired cookie) re-renders the real view.
  useEffect(() => {
    if (!viewAs) return;
    setLeft(minutesLeft(viewAs.expiresAt));
    const timer = setInterval(() => {
      const m = minutesLeft(viewAs.expiresAt);
      setLeft(m);
      if (m === 0) router.refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [viewAs, router]);

  const selected = roles.find((r) => r.id === role);
  const needsDomain = selected?.scope === "domain";
  const canApply = Boolean(selected) && (!needsDomain || Boolean(domain));

  const apply = () =>
    startTransition(async () => {
      const result = await startViewAs(role, needsDomain ? domain : null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  const exit = () =>
    startTransition(async () => {
      await exitViewAs();
      setRole("");
      setDomain("");
      router.refresh();
    });

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border bg-background p-1 shadow-lg">
      {viewAs ? (
        <Badge variant="secondary" className="ml-2">
          Viewing as {capitalize(viewAs.role)}
          {viewAs.domain ? ` · ${capitalize(viewAs.domain)}` : ""} · {left}m
        </Badge>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={viewAs ? "outline" : "default"}
            className="rounded-full"
            disabled={isPending}
          >
            <EyeIcon data-icon="inline-start" />
            {viewAs ? "Switch" : "View as…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-72 flex-col gap-4">
          <PopoverHeader>
            <PopoverTitle>View as role</PopoverTitle>
          </PopoverHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="view-as-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value);
                setDomain("");
              }}
            >
              <SelectTrigger id="view-as-role" className="w-full">
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {capitalize(r.id)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {needsDomain ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="view-as-domain">Domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger id="view-as-domain" className="w-full">
                  <SelectValue placeholder="Pick a domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DOMAIN_IDS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {capitalize(d)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Writes are real and run with this role's permissions. Lasts 1 hour.
          </p>

          <Button onClick={apply} disabled={!canApply || isPending}>
            {isPending ? "Switching…" : "Switch"}
          </Button>
        </PopoverContent>
      </Popover>

      {viewAs ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full"
          aria-label="Exit view as"
          onClick={exit}
          disabled={isPending}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
