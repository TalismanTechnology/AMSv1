import type { NextConfig } from "next";

// Files in /public aren't content-hashed, so they get a day of browser/CDN
// caching plus a week of stale-while-revalidate rather than "immutable".
// Only these named paths are matched: HTML, /api, /_next (already hashed and
// immutable), app/icon.svg and /.well-known keep their default headers.
const PUBLIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  serverExternalPackages: ["officeparser", "pdfjs-dist", "libreoffice-convert", "resend"],
  async headers() {
    return [
      {
        source: "/:dir(images|videos|audio)/:path*",
        headers: [{ key: "Cache-Control", value: PUBLIC_ASSET_CACHE }],
      },
      {
        source: "/:file(logo|file|globe|next|vercel|window).svg",
        headers: [{ key: "Cache-Control", value: PUBLIC_ASSET_CACHE }],
      },
    ];
  },
};

export default nextConfig;
