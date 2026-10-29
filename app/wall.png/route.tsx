import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { WallImage } from "@/components/wall/wall-image";
import { isValidWallToken } from "@/lib/wall/token";
import { loadWallStats } from "@/lib/wall/stats";
import { clampDimension, parseWallLayout, type WallLayout } from "@/lib/wall/aggregate";

// Static PNG of the /wall dashboard, for setting as a wallpaper by a
// shortcut / cron: /wall.png?token=…&w=2560&h=1600[&layout=phone].
// Markup in components/wall/wall-image.tsx.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

const FONT_DIR = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts");
type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
let fontsPromise: Promise<Font[] | undefined> | null = null;

/** Liberation Sans from pdfjs-dist when it's on disk; else Satori's default font. */
function loadFonts(): Promise<Font[] | undefined> {
  fontsPromise ??= Promise.all(
    (
      [
        ["LiberationSans-Regular.ttf", 400],
        ["LiberationSans-Bold.ttf", 700],
      ] as const
    ).map(async ([file, weight]): Promise<Font> => {
      const buf = await readFile(path.join(FONT_DIR, file));
      return {
        name: "Liberation Sans",
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      };
    })
  ).catch(() => undefined);
  return fontsPromise;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!isValidWallToken(params.get("token"))) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const w = clampDimension(params.get("w"), 2560);
  const h = clampDimension(params.get("h"), 1600);
  const layout: WallLayout = parseWallLayout(params.get("layout")) ?? (h > w ? "phone" : "desktop");

  const [stats, fonts] = await Promise.all([loadWallStats(createAdminClient()), loadFonts()]);

  return new ImageResponse(<WallImage stats={stats} w={w} h={h} layout={layout} />, {
    width: w,
    height: h,
    fonts,
    headers: { "Content-Type": "image/png", ...NO_STORE },
  });
}
