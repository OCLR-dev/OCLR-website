import { remoteConfiguration } from "./src/lib/data-source";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
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
const config: NextConfig = {
  poweredByHeader: false,
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
