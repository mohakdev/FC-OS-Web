// Cloudflare Worker: proxy fc-os.tech -> Tailscale Funnel -> box Caddy shim (:18080)
// -> Coolify Traefik (:80) -> app container.
//
// The Worker's own fetch() sends the correct SNI (claw.tail3b56f7.ts.net), which
// the Funnel requires - a plain CNAME cannot do this. Because of that, every request
// reaches the box with `Host: claw.tail3b56f7.ts.net`; the real public host rides in
// `X-Orig-Host` and the Caddy shim (scripts/caddy/Caddyfile) restores it so Traefik
// can route many <app>.fc-os.tech hosts through the one Funnel.
//
// It also caches immutable static assets (/_next/static, images, fonts) at the
// Cloudflare edge, so only HTML documents and API routes actually round-trip to
// the box over the Tailscale DERP relay. This is the main latency win on the
// SRMIST network, where the relay hop (UDP blocked -> no direct path) is costly.

const ORIGIN = "https://claw.tail3b56f7.ts.net";

const STATIC_RE =
  /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|webp|avif|map|txt)$/i;

function isStatic(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    STATIC_RE.test(pathname)
  );
}

export default {
  async fetch(request, env, ctx) {
    const inUrl = new URL(request.url);
    const originUrl = new URL(inUrl.pathname + inUrl.search, ORIGIN);

    const headers = new Headers(request.headers);
    // Tell the app what the public host really is (canonical URLs, cookies).
    headers.set("X-Forwarded-Host", inUrl.hostname);
    headers.set("X-Forwarded-Proto", "https");
    // Survives the Funnel hop (which clobbers Host/X-Forwarded-Host); the box shim
    // turns it back into Host for Traefik routing.
    headers.set("X-Orig-Host", inUrl.hostname);
    // Give the origin a trustworthy client IP for rate limiting. `CF-Connecting-IP`
    // is set by Cloudflare at the edge (a client cannot forge it); overwrite any
    // client-supplied `X-Forwarded-For` with it so a spoofed header can't poison
    // the per-client rate-limit bucket. Better Auth reads `cf-connecting-ip`
    // (advanced.ipAddress.ipAddressHeaders in src/lib/auth/server.ts).
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp) headers.set("X-Forwarded-For", clientIp);

    const cacheable =
      (request.method === "GET" || request.method === "HEAD") &&
      isStatic(inUrl.pathname);

    // ---- Static assets: serve from edge cache, skip the funnel trip on hits ----
    if (cacheable) {
      const cache = caches.default;
      // Normalize the key so HEAD (curl -I) and browser GET share one entry.
      const cacheKey = new Request(request.url, { method: "GET" });

      const hit = await cache.match(cacheKey);
      if (hit) {
        const h = new Response(hit.body, hit);
        h.headers.set("X-Edge-Cache", "HIT");
        return h;
      }

      const resp = await fetch(
        new Request(originUrl, {
          method: "GET",
          headers,
          redirect: "manual",
        }),
      );

      // Only cache real successes; pass failures through untouched.
      if (resp.status === 200) {
        const cached = new Response(resp.body, resp);
        // Next stamps `Vary: rsc, next-router-*` on every response; Cloudflare only
        // honors `Vary: Accept-Encoding`, so any other Vary blocks caching entirely
        // (assets flap MISS -> EXPIRED -> MISS, never HIT). These are byte-identical
        // static files, so the RSC Vary is meaningless here -> strip it.
        cached.headers.delete("Vary");
        cached.headers.delete("Set-Cookie"); // Cache API refuses to store with Set-Cookie
        // Next.js static filenames are content-hashed -> safe to cache forever.
        cached.headers.set(
          "Cache-Control",
          "public, max-age=31536000, immutable",
        );
        cached.headers.set("X-Edge-Cache", "MISS");
        ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        return cached;
      }
      return resp;
    }

    // ---- Everything else (HTML, API): live proxy through the funnel ----
    const resp = await fetch(
      new Request(originUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      }),
    );

    // Rewrite redirects that would leak the funnel hostname to the public domain.
    const loc = resp.headers.get("Location");
    if (loc && loc.includes("claw.tail3b56f7.ts.net")) {
      const h = new Headers(resp.headers);
      h.set(
        "Location",
        loc.replace(
          /https?:\/\/claw\.tail3b56f7\.ts\.net/g,
          `https://${inUrl.hostname}`,
        ),
      );
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: h,
      });
    }
    return resp;
  },
};
