"use client";

import { ImageUp, Trash2 } from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useRef,
  useState,
  useTransition,
} from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";

import { removeAvatar, uploadAvatar } from "@/app/dashboard/profile/actions";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  AVATAR_INPUT_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
} from "@/lib/validation/profile";

// Shared by the Customize dialog (/dashboard/profile) and the onboarding
// details screen (/onboarding/details). Neither piece is tied to a Dialog: the
// caller owns the title, and the cropper's action row renders in `Footer`.

export type AvatarOwner = {
  id: string;
  firstName: string;
  lastName: string;
  avatarVersion: number | null;
};

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

/** Current picture + "Add/Change picture" and "Remove". Picking a file hands an object URL to `onPicked` for cropping. */
export function AvatarSection({
  profile,
  onPicked,
}: {
  profile: AvatarOwner;
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

const DefaultFooter = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    {children}
  </div>
);

/** Round crop + zoom, then uploads a 512px webp via `uploadAvatar`. */
export function AvatarCropper({
  src,
  onCancel,
  onSaved,
  Footer = DefaultFooter,
}: {
  src: string;
  onCancel: () => void;
  onSaved: () => void;
  /** Wraps the Back / Save buttons (e.g. `DialogFooter` inside a dialog). */
  Footer?: ComponentType<{ children: ReactNode }>;
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

      <Footer>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={uploading}
        >
          Back
        </Button>
        <Button type="button" onClick={upload} disabled={uploading || !area}>
          {uploading ? <Spinner /> : null}
          Save picture
        </Button>
      </Footer>
    </>
  );
}
