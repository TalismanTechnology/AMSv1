import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidWallToken } from "@/lib/wall/token";
import { loadWallStats } from "@/lib/wall/stats";
import { parseWallLayout } from "@/lib/wall/aggregate";
import { WallDashboard } from "@/components/wall/wall-dashboard";

// Private live-stats wallpaper: /wall?token=…&layout=desktop|phone. No
// sign-in; WALL_TOKEN gates it (lib/wall/token.ts). Without layout it follows
// the screen: phone layout in portrait, desktop otherwise.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AskMySchool · Live",
  robots: { index: false, follow: false },
  // Keep the token in the URL from leaking through a Referer header.
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#07110d",
};

export default async function WallPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; layout?: string | string[] }>;
}) {
  const { token, layout } = await searchParams;
  if (!isValidWallToken(typeof token === "string" ? token : null)) notFound();

  const stats = await loadWallStats(createAdminClient());
  return <WallDashboard stats={stats} layout={parseWallLayout(layout) ?? "auto"} />;
}
