"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { linkMeta } from "@/lib/profile/links";
import { normalizeLink } from "@/lib/validation/profile";

/**
 * Up to `max` profile link rows with a live platform-icon preview. Blank rows
 * are unused slots (the schema drops them). Shared by the Customize dialog and
 * the onboarding details screen.
 */
export function LinksEditor({
  links,
  max,
  onChange,
}: {
  links: string[];
  max: number;
  onChange: (links: string[]) => void;
}) {
  const set = (i: number, value: string) =>
    onChange(links.map((l, j) => (j === i ? value : l)));
  const remove = (i: number) => {
    const next = links.filter((_, j) => j !== i);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div className="grid gap-2">
      <Label>Links</Label>
      {links.map((link, i) => {
        // Live preview of how the link will render: platform icon, or a globe
        // + hostname for anything else (personal sites, blogs…).
        const normalized = normalizeLink(link);
        const meta = normalized ? linkMeta(normalized) : null;
        const Icon = meta?.icon;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional slots with no stable id
          <div key={i} className="flex items-center gap-2">
            <InputGroup>
              <InputGroupAddon>
                {Icon ? (
                  <Icon className="size-4" />
                ) : (
                  <span className="size-4" />
                )}
              </InputGroupAddon>
              <InputGroupInput
                type="text"
                inputMode="url"
                aria-label={`Link ${i + 1}`}
                placeholder="linkedin.com/in/you or yoursite.com"
                value={link}
                onChange={(e) => set(i, e.target.value)}
              />
            </InputGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove link ${i + 1}`}
              onClick={() => remove(i)}
            >
              <X />
            </Button>
          </div>
        );
      })}
      {links.length < max ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start text-muted-foreground"
          onClick={() => onChange([...links, ""])}
        >
          <Plus />
          Add link
        </Button>
      ) : null}
    </div>
  );
}
