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
     * - favicon.ico and static assets (svg, png, jpg, etc.)
     *
     * This covers:
     * - / (platform landing)
     * - /s/{slug}/* (school-scoped routes)
     * - /super-admin/* (super admin routes)
     * - /login, /register, /admin/*, /parent/* (legacy redirects)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
