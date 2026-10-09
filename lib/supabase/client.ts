import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "./cookie-options";

// createBrowserClient already returns one shared client in the browser, so
// every caller shares a single session and a single auto-refresh timer (two
// timers would race to spend the same single-use refresh token).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieOptions() }
  );
}
