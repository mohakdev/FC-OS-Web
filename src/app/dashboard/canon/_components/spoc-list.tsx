"use client";

import { Phone, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CanonPerson } from "@/utils/canonDbActions";
import Link from "next/link";

/** SPOCs one per line, italic, each with a tap-to-call phone link. */
export function SpocList({
  spocs,
  editable,
  members,
  onChange,
}: {
  spocs: CanonPerson[];
  /** Only managers assign SPOCs; SPOCs editing their own event can't. */
  editable: boolean;
  members: CanonPerson[];
  onChange: (spocs: CanonPerson[]) => void;
}) {
  const available = members.filter((m) => !spocs.some((s) => s.id === m.id));

  return (
    <section aria-label="Event SPOCs" className="flex gap-8 font-serif text-sm italic">
      {spocs.length === 0 && !editable && (
        <p className="text-muted-foreground ">No SPOCs yet</p>
      )}
      {spocs.map((s) => (
        <p key={s.id} className="flex items-center gap-2">
          <span className="font-medium">
            {s.firstName} {s.lastName}
          </span>
          <Link
            href={`tel:${s.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
            aria-label={`Call ${s.firstName}`}
          >
            <Phone className="size-3.5" />
          </Link>
          {editable && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground"
              aria-label={`Remove ${s.firstName}`}
              onClick={() => onChange(spocs.filter((x) => x.id !== s.id))}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </p>
      ))}
      {editable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit text-muted-foreground"
            >
              <UserPlus className="size-4" />
              Add SPOC
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search members…" />
              <CommandList>
                <CommandEmpty>No members found.</CommandEmpty>
                <CommandGroup>
                  {available.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.firstName} ${m.lastName} ${m.id}`}
                      onSelect={() => onChange([...spocs, m])}
                    >
                      {m.firstName} {m.lastName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </section>
  );
}
