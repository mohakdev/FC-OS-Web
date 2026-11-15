import { getAccessContext } from "@/lib/auth/context";
import { getObject } from "@/lib/storage/s3";
import { getAvatarKey } from "@/utils/dbActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a member's profile picture out of the private MinIO bucket.
 *
 * Outside the `proxy.ts` matcher (`/dashboard/:path*`), so this route is its own
 * auth gate: only signed-in, approved members see other members' faces (and
 * anyone sees their own). URLs
 * carry `?v=<avatarUpdatedAt>`, so the response can be cached hard — a new
 * picture gets a new URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const ctx = await getAccessContext();
  const { userId } = await params;
  // Approved members see everyone; anyone signed in with a profile sees their
  // own (a pending applicant previews the picture they set during onboarding).
  if (!ctx || (ctx.status !== "approved" && ctx.userId !== userId)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return new Response("Not found", { status: 404 });
  }

  const key = await getAvatarKey(userId);
  if (!key) return new Response("Not found", { status: 404 });

  const object = await getObject(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": object.contentType,
      // `private`: never let a shared cache (Cloudflare) store an auth-gated image.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
