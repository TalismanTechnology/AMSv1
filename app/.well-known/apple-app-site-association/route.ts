import { NextResponse } from "next/server";
import { appleAppSiteAssociation, appleTeamId } from "@/lib/native/app-links";

// https://askmyschool.app/.well-known/apple-app-site-association
//
// Universal links for the iOS app (lib/native/app-links.ts). Apple's CDN
// fetches this without cookies or redirects, so it must be served as JSON
// straight from this path. middleware.ts skips /.well-known for that reason.
// Set APPLE_TEAM_ID in Vercel once the Apple Developer account exists.

export function GET() {
  return NextResponse.json(appleAppSiteAssociation(appleTeamId(process.env.APPLE_TEAM_ID)), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
