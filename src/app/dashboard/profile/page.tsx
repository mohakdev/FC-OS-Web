import { redirect } from "next/navigation";
import CopyButton from "@/components/copy-button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { getAccessContext } from "@/lib/auth/context";
import { canAny } from "@/lib/auth/permissions";
import { formatIsoDob } from "@/lib/profile/dates";
import { linkMeta } from "@/lib/profile/links";
import { formatPhone, linkLimit } from "@/lib/validation/profile";
import { getProfile } from "@/utils/dbActions";
import CustomizeDialog from "./customize-dialog";

export const dynamic = "force-dynamic";

const GENDER_LABELS = { male: "Male", female: "Female" } as const;

export default async function ProfilePage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/dashboard");

  const profile = await getProfile(ctx.userId);
  if (!profile) redirect("/dashboard");

  const links = profile.links
    .map((l) => linkMeta(l.url))
    .filter((m) => m !== null);

  return (
    <div className="flex flex-col gap-6 mt-6 m-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-7xl text-primary">Your Profile</h1>
        </div>
        <CustomizeDialog
          maxLinks={linkLimit(canAny(ctx.grants, "profile.links.extended"))}
          profile={{
            id: profile.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone: profile.phone,
            dateOfBirth: profile.dateOfBirth,
            quote: profile.quote,
            links: profile.links,
            avatarVersion: profile.avatarVersion,
          }}
        />
      </div>

      <div className="mt-6 space-y-8">
        {/* Section for picture, name and quote */}
        <div className="flex items-center gap-6">
          <ProfileAvatar
            userId={profile.id}
            firstName={profile.firstName}
            lastName={profile.lastName}
            avatarVersion={profile.avatarVersion}
            className="size-24"
            fallbackClassName="bg-primary font-serif text-5xl text-primary-foreground"
          />
          <div className="space-y-1 flex-1">
            <p className="text-3xl font-semibold tracking-tight">
              {profile.firstName} {profile.lastName}
            </p>
            <span className="font-medium text-muted-foreground flex items-center gap-4">
              {profile.email}
              <CopyButton value={profile.email} />
            </span>
            {profile.quote ? (
              <p className="max-w-prose pt-1 text-muted-foreground font-serif">
                “<span className="italic">{profile.quote}</span>”
              </p>
            ) : null}
          </div>
        </div>

        {/* Render Other Details */}
        <div className="p-8 w-full space-y-8 sm:grid sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">Phone</p>
            <span className="text-xl font-semibold">
              {formatPhone(profile.phone)}
            </span>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">
              {profile.domains.length > 1 ? "Domains" : "Domain"}
            </p>
            <ul className="space-y-0.5">
              {profile.domains.length > 0 ? (
                profile.domains.map((domain) => (
                  <li key={domain} className="text-xl font-semibold capitalize">
                    {domain}
                  </li>
                ))
              ) : (
                <span className="text-xl font-semibold">None</span>
              )}
            </ul>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">
              {profile.roles.length > 1 ? "Roles" : "Role"}
            </p>
            <ul className="space-y-0.5">
              {profile.roles.length > 0 ? (
                profile.roles.map((role) => (
                  <li key={role} className="text-xl font-semibold capitalize">
                    {role}
                  </li>
                ))
              ) : (
                <span className="text-xl font-semibold">None</span>
              )}
            </ul>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">Gender</p>
            <span className="text-xl font-semibold">
              {profile.gender ? GENDER_LABELS[profile.gender] : "Not set"}
            </span>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">
              Date of birth
            </p>
            <span className="text-xl font-semibold">
              {formatIsoDob(profile.dateOfBirth) ?? "Not set"}
            </span>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <p className="text-lg font-medium text-muted-foreground">
              {links.length > 1 ? "Links" : "Link"}
            </p>
            <ul className="space-y-0.5">
              {links.length > 0 ? (
                links.map(({ icon: Icon, label, href }) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xl font-semibold underline-offset-4 hover:underline"
                    >
                      <Icon className="size-5 shrink-0" />
                      {label}
                    </a>
                  </li>
                ))
              ) : (
                <span className="text-xl font-semibold">None</span>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
