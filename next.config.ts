import type { NextConfig } from "next";

const workerBuild = process.env.KTS_WORKER_BUILD === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Production source maps would expose server code; keep them off.
  productionBrowserSourceMaps: false,
  // The Cloudflare build (KTS_WORKER_BUILD=1) leaves the local-only Postgres
  // driver out entirely: the flag is inlined at build time and `pg` is
  // replaced by a stub, so nothing of it is bundled into the Worker.
  serverExternalPackages: workerBuild ? [] : ["pg"],
  env: { KTS_PG_DRIVER: workerBuild ? "disabled" : "enabled" },
  turbopack: workerBuild ? { resolveAlias: { pg: "./server/db/pg-unavailable.ts" } } : {},
  experimental: {
    serverActions: { bodySizeLimit: "64kb" },
  },
};

export default nextConfig;

// Local `next dev` with Cloudflare bindings (no-op in production builds).
if (process.env.NODE_ENV === "development" && process.env.DB_DRIVER !== "pg") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev()).catch(() => {});
}
