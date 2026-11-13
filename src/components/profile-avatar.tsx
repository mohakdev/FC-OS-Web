import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * A member's profile picture, falling back to initials. The image comes from
 * the auth-gated `/api/avatar/[userId]` route; `avatarVersion` (null = no
 * picture) is the cache-buster, so a new upload is a new URL.
 */
export function ProfileAvatar({
  userId,
  firstName,
  lastName,
  avatarVersion,
  className,
  fallbackClassName,
}: {
  userId: string;
  firstName: string;
  lastName: string;
  avatarVersion: number | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    // Keyed on the version so the Radix Root remounts whenever the picture
    // changes. Radix keeps the image status in Root state and `AvatarImage`
    // never resets it on unmount, so without a fresh Root a removed picture
    // leaves status "loaded" forever: no <img>, and the fallback (which only
    // renders when status !== "loaded") stays hidden — an empty circle.
    <Avatar key={avatarVersion ?? "none"} className={className}>
      {avatarVersion !== null ? (
        <AvatarImage
          src={`/api/avatar/${userId}?v=${avatarVersion}`}
          alt={`${firstName} ${lastName}`}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
    </Avatar>
  );
}
