import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_TOKEN_COOKIE } from "@/lib/push/device-cookie";

// The app registers its push token here after the parent allows
// notifications (components/native/native-push.tsx).
//
//   POST /api/push/devices   { token, platform: "ios" | "android" }

const bodySchema = z.object({
  token: z.string().min(16).max(4096).regex(/^[A-Za-z0-9:_\-.]+$/),
  platform: z.enum(["ios", "android"]),
});

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device" }, { status: 400 });
  }

  // Service role: on a shared phone the same token moves from one account to
  // the next, which the user's own RLS couldn't do.
  const { error } = await createAdminClient()
    .from("push_devices")
    .upsert(
      {
        token: parsed.data.token,
        platform: parsed.data.platform,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );

  if (error) {
    console.error("[push] could not register device", error);
    return NextResponse.json({ error: "Could not register device" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  // Lets sign-out find and forget this phone's token.
  response.cookies.set(PUSH_TOKEN_COOKIE, parsed.data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}
