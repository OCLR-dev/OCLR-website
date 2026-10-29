import { remoteConfiguration } from "./src/lib/data-source";
import { isPrivateNetworkHostname } from "./src/lib/site-origin";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { publicAssetCacheHeaders } from "./src/lib/static-asset-cache";
import { join } from "node:path";
if (
  process.env.OCLR_DATA_SOURCE &&
  process.env.OCLR_DATA_SOURCE !== "database" &&
  (process.env.OCLR_DATA_SOURCE !== "remote" ||
    process.env.NODE_ENV !== "development")
)
  throw new Error(
    "Remote data is available only with next dev; production requires database mode.",
  );
if (process.env.OCLR_DATA_SOURCE === "remote") remoteConfiguration();
// A private IPv4 APP_URL is accepted only by next dev, so this allowlist never
// reaches a production server. It lets a phone on the same network load the
// dev assets that Next otherwise answers only for the startup hostname.
const developmentOrigins = (() => {
  if (process.env.NODE_ENV !== "development" || !process.env.APP_URL) return [];
  try {
    const { hostname } = new URL(process.env.APP_URL);
    return isPrivateNetworkHostname(hostname) ? [hostname] : [];
  } catch {
    return [];
  }
})();
const config: NextConfig = {
  poweredByHeader: false,
  ...(developmentOrigins.length
    ? { allowedDevOrigins: developmentOrigins }
    : {}),
  distDir: process.env.OCLR_DATA_SOURCE === "remote" ? ".next-remote" : ".next",
  ...(process.env.OCLR_DATA_SOURCE === "remote"
    ? {
        experimental: { serverComponentsHmrCache: false },
        logging: { fetches: { fullUrl: false, hmrRefreshes: false } },
      }
    : {}),
  async redirects() {
    return [
      {
        source: "/tournaments/:edition/participants",
        destination: "/tournaments/:edition/players",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      ...publicAssetCacheHeaders(
        join(process.cwd(), "public"),
        process.env.NODE_ENV === "production",
      ),
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default createNextIntlPlugin()(config);
