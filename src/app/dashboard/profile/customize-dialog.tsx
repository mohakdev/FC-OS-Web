"use client";

import { CalendarIcon, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AvatarCropper,
  AvatarSection,
} from "@/components/profile/avatar-editor";
import { LinksEditor } from "@/components/profile/links-editor";
import { QuoteField } from "@/components/profile/quote-field";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { formatDob, parseIsoDate, toIsoDate } from "@/lib/profile/dates";
import { cn } from "@/lib/utils";
import { updateProfileDetails } from "./actions";

type CustomizeProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string | null;
  quote: string | null;
  links: { url: string }[];
  avatarVersion: number | null;
};

// Stored as `+91XXXXXXXXXX`; the field shows the 10 digits after the addon.
const localDigits = (phone: string) => phone.replace(/^\+91/, "");

export default function CustomizeDialog({
  profile,
  maxLinks,
}: {
  profile: CustomizeProfile;
  /** 3, or 6 with `profile.links.extended` — the server re-checks. */
  maxLinks: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Customize profile">
          <Pencil />
          <span className="hidden sm:inline">Customize</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* Remount on every open so the form starts from the saved profile. */}
        {open ? (
          <CustomizeForm
            profile={profile}
            maxLinks={maxLinks}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomizeForm({
  profile,
  maxLinks,
  onDone,
}: {
  profile: CustomizeProfile;
  maxLinks: number;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState(localDigits(profile.phone));
  const [dob, setDob] = useState<Date | undefined>(
    parseIsoDate(profile.dateOfBirth),
  );
  const [quote, setQuote] = useState(profile.quote ?? "");
  const [links, setLinks] = useState<string[]>(
    profile.links.length > 0 ? profile.links.map((l) => l.url) : [""],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Crop step: set while the user is framing a freshly picked image.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!dob) {
      setError("Pick your date of birth.");
      return;
    }
    startSaving(async () => {
      const res = await updateProfileDetails({
        phone,
        dateOfBirth: toIsoDate(dob),
        quote,
        links,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      toast.success("Profile updated");
      onDone();
    });
  };

  if (cropSrc) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Frame your picture</DialogTitle>
          <DialogDescription>Drag to move, slide to zoom.</DialogDescription>
        </DialogHeader>
        <AvatarCropper
          src={cropSrc}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onSaved={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          Footer={DialogFooter}
        />
      </>
    );
  }

  const today = new Date();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Customize profile</DialogTitle>
        <DialogDescription>
          Other members see these in the Member Directory.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <AvatarSection profile={profile} onPicked={setCropSrc} />

        <div className="grid gap-2">
          <Label htmlFor="customize-phone">Phone</Label>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>+91</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="customize-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </InputGroup>
        </div>

        <div className="grid gap-2">
          <Label>Date of birth</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "justify-start font-normal",
                  !dob && "text-muted-foreground",
                )}
              >
                <CalendarIcon />
                {dob ? formatDob(dob) : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                captionLayout="dropdown"
                selected={dob}
                defaultMonth={dob ?? new Date(today.getFullYear() - 19, 0)}
                startMonth={new Date(today.getFullYear() - 80, 0)}
                endMonth={today}
                disabled={(d) => d > today}
                onSelect={setDob}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <QuoteField id="customize-quote" value={quote} onChange={setQuote} />

        <LinksEditor links={links} max={maxLinks} onChange={setLinks} />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
