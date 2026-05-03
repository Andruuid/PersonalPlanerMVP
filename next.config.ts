import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statically-typed Link hrefs and router.push() — Next.js 16 stable API
  // (top-level, not under `experimental`).
  typedRoutes: true,

  experimental: {
    serverActions: {
      // Default is 1MB; bumped for forms that include longer free-text or
      // multiple attachments. Keep modest — large payloads belong in API routes.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
