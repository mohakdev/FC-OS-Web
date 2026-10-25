import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained `.next/standalone` (server.js + traced node_modules) for the
  // Docker image Coolify builds. See Dockerfile.
  output: "standalone",
  experimental: {
    // Server Action CSRF check compares `Origin` against `X-Forwarded-Host`. The
    // Caddy shim on the box (scripts/caddy/Caddyfile) restores both `Host` and
    // `X-Forwarded-Host` from the Worker's `X-Orig-Host`, so they normally match.
    // This allowlist is the backstop in case a hop (Tailscale Funnel, Traefik)
    // ever rewrites the forwarded host to `claw.tail3b56f7.ts.net` again — exact
    // literals, no wildcards.
    serverActions: {
      allowedOrigins: ["fc-os.tech", "claw.tail3b56f7.ts.net"],
    },
  },
};

export default nextConfig;
