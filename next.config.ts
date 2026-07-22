import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The Tailscale Funnel is the last hop before the app and rewrites
    // `X-Forwarded-Host` to its own hostname, clobbering the value the Cloudflare
    // Worker set (workers/fc-os-proxy.js). Next's Server Action CSRF check then sees
    // Origin `fc-os.tech` vs forwarded host `claw.tail3b56f7.ts.net` and aborts every
    // mutation. Trust the real public origins — exact literals, no wildcards.
    serverActions: {
      allowedOrigins: ["fc-os.tech", "claw.tail3b56f7.ts.net"],
    },
  },
};

export default nextConfig;
