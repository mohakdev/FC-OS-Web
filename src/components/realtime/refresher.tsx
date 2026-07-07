"use client";

import { useRouter } from "next/navigation";
import type { RealtimeEvent } from "@/lib/realtime/notify";
import { useRealtimeEvent } from "./realtime-provider";

/**
 * Invisible client component that calls `router.refresh()` when a matching
 * realtime signal arrives. Drop it into server-rendered pages that have no
 * existing client `router` of their own (Opus overview, Member Requests,
 * Member Directory). The refresh re-fetches the current route's RSC payload.
 *
 * Props are plain serializable values (not a predicate function) so this can be
 * rendered directly from a server component. `domain`, when given, further
 * narrows an `opus-board` match to a single domain.
 */
export function Refresher({
  scope,
  domain,
}: {
  scope: RealtimeEvent["scope"];
  domain?: string;
}) {
  const router = useRouter();
  useRealtimeEvent(
    (evt) =>
      evt.scope === scope &&
      (domain === undefined ||
        (evt.scope === "opus-board" && evt.domain === domain)),
    () => router.refresh(),
  );
  return null;
}
