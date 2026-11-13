"use client";

import { CalendarIcon, ImageUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";

import { ProfileAvatar } from "@/components/profile-avatar";
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
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDob, parseIsoDate, toIsoDate } from "@/lib/profile/dates";
import { linkMeta } from "@/lib/profile/links";
import { cn } from "@/lib/utils";
import {
  AVATAR_INPUT_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  LINKS_MAX,
  normalizeLink,
  QUOTE_MAX,
} from "@/lib/validation/profile";
import { removeAvatar, updateProfileDetails, uploadAvatar } from "./actions";

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

/** Crops `src` to `area` and scales it to a square webp blob. */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE_PX;
  canvas.height = AVATAR_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    AVATAR_SIZE_PX,
    AVATAR_SIZE_PX,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
      "image/webp",
      0.9,
    ),
  );
}

export default function CustomizeDialog({
  profile,
}: {
  profile: CustomizeProfile;
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
          <CustomizeForm profile={profile} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomizeForm({
  profile,
  onDone,
}: {
  profile: CustomizeProfile;
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
      />
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

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="customize-quote">Display quote</Label>
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                quote.length > QUOTE_MAX && "text-destructive",
              )}
            >
              {quote.length}/{QUOTE_MAX}
            </span>
          </div>
          <Textarea
            id="customize-quote"
            rows={2}
            maxLength={QUOTE_MAX}
            placeholder="Something you live by"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
          />
        </div>

        <LinksEditor links={links} onChange={setLinks} />

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

function AvatarSection({
  profile,
  onPicked,
}: {
  profile: CustomizeProfile;
  onPicked: (objectUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [removing, startRemoving] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_INPUT_TYPES.includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    onPicked(URL.createObjectURL(file));
  };

  const remove = () =>
    startRemoving(async () => {
      const res = await removeAvatar();
      if ("error" in res) toast.error(res.error);
      else toast.success("Picture removed");
    });

  return (
    <div className="flex items-center gap-4">
      <ProfileAvatar
        userId={profile.id}
        firstName={profile.firstName}
        lastName={profile.lastName}
        avatarVersion={profile.avatarVersion}
        className="size-16"
        fallbackClassName="bg-primary font-serif text-2xl text-primary-foreground"
      />
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_INPUT_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <ImageUp />
          {profile.avatarVersion !== null ? "Change picture" : "Add picture"}
        </Button>
        {profile.avatarVersion !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={removing}
            onClick={remove}
          >
            {removing ? <Spinner /> : <Trash2 />}
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AvatarCropper({
  src,
  onCancel,
  onSaved,
}: {
  src: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [uploading, startUploading] = useTransition();

  const upload = () => {
    if (!area) return;
    startUploading(async () => {
      try {
        const blob = await cropToBlob(src, area);
        const form = new FormData();
        form.append("file", blob, "avatar.webp");
        const res = await uploadAvatar(form);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success("Picture updated");
        onSaved();
      } catch {
        toast.error("Could not process that image.");
      }
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Frame your picture</DialogTitle>
        <DialogDescription>Drag to move, slide to zoom.</DialogDescription>
      </DialogHeader>

      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>

      <Slider
        aria-label="Zoom"
        min={1}
        max={3}
        step={0.01}
        value={[zoom]}
        onValueChange={([z]) => setZoom(z)}
      />

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={uploading}>
          Back
        </Button>
        <Button onClick={upload} disabled={uploading || !area}>
          {uploading ? <Spinner /> : null}
          Save picture
        </Button>
      </DialogFooter>
    </>
  );
}

function LinksEditor({
  links,
  onChange,
}: {
  links: string[];
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
      {links.length < LINKS_MAX ? (
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
