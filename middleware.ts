import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and static assets (images, icons, fonts, robots.txt,
     *   sitemap.xml, the web manifest)
     * - .well-known (apple-app-site-association must never redirect)
     *
     * This covers:
     * - / (platform landing)
     * - /s/{slug}/* (school-scoped routes)
     * - /super-admin/* (super admin routes)
     * - /login, /login/staff, /auth/blackbaud/*
     * - /register, /admin/*, /parent/* (legacy redirects)
     * - /api/* (keeps the session fresh for route handlers too)
     */
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|otf)$).*)",
  ],
};
