import type { NextConfig } from "next";

// Files in /public aren't content-hashed, so they get a day of browser/CDN
// caching plus a week of stale-while-revalidate rather than "immutable".
// Only these named paths are matched: HTML, /api, /_next (already hashed and
// immutable), app/icon.svg and /.well-known keep their default headers.
const PUBLIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  serverExternalPackages: ["officeparser", "pdfjs-dist", "libreoffice-convert", "resend"],
  // /wall.png sets its text in Liberation Sans (SIL OFL), read from disk.
  outputFileTracingIncludes: {
    "/wall.png": ["./node_modules/pdfjs-dist/standard_fonts/LiberationSans-{Regular,Bold}.ttf"],
  },
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
      {
        // The private stats wallpaper: never indexed (the page and route also
        // send no-store themselves).
        source: "/:path(wall|wall\\.png|wall\\.json)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Browsers must always see the latest service worker.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
