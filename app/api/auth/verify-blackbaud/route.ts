import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRosterMatch } from "@/lib/blackbaud/roster";
import { normalizeEmail } from "@/lib/blackbaud/crypto";
import { sendEmail } from "@/lib/email/resend";

// Parent-facing verification. A parent enters their email; if it matches an
// active guardian record in their school's synced Blackbaud roster, we send a
// magic link that signs them into that school.
//
// A roster match proves ELIGIBILITY, not identity — anyone can type a known
// parent's address. The emailed link is what proves they control the inbox, so
// a session is never minted here.

const requestSchema = z.object({
  schoolSlug: z.string().min(1).max(100),
  email: z.string().email().max(320),
});

// Same wording for every outcome. Differentiating "not on file" from "check
// your email" would turn this endpoint into a roster enumeration oracle.
const GENERIC_RESPONSE = {
  message: "If your email is on file with your school, we've sent a sign-in link.",
};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// Per-instance limiter. Enough to blunt casual scripted enumeration; a
// multi-instance deploy needs a shared store (Redis/Postgres) to be real.
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function signInEmailHtml(schoolName: string, link: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">Sign in to ${schoolName}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#444">
        We matched your email against your school's records. Click below to sign in to AskMySchool.
      </p>
      <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:500">
        Sign in
      </a>
      <p style="font-size:13px;line-height:1.6;margin:24px 0 0;color:#777">
        This link expires shortly and can only be used once. If you didn't request it, you can ignore this email.
      </p>
    </div>
  `;
}

/**
 * Provision the Supabase user and school membership for a verified parent.
 *
 * Runs only after a roster match. The Blackbaud match IS the approval, so the
 * membership is created approved and these parents skip the /pending gate.
 */
async function ensureVerifiedParent(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  schoolId: string,
  rosterName: { first: string | null; last: string | null }
): Promise<string | null> {
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users.find(
    (candidate) => candidate.email && normalizeEmail(candidate.email) === email
  );

  let userId = existing?.id ?? null;

  if (!userId) {
    const fullName = [rosterName.first, rosterName.last]
      .filter(Boolean)
      .join(" ");

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // the magic link is the confirmation
      user_metadata: {
        role: "parent",
        ...(fullName ? { full_name: fullName } : {}),
      },
    });

    if (error || !created.user) {
      console.error(`[blackbaud-verify] user creation failed: ${error?.message}`);
      return null;
    }

    userId = created.user.id;
  }

  const { data: membership } = await admin
    .from("school_memberships")
    .select("id, approved")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!membership) {
    const { error } = await admin.from("school_memberships").insert({
      user_id: userId,
      school_id: schoolId,
      role: "parent",
      approved: true,
    });

    if (error) {
      console.error(`[blackbaud-verify] membership insert failed: ${error.message}`);
      return null;
    }
  } else if (!membership.approved) {
    // Previously registered and stuck pending; the roster match clears them.
    await admin
      .from("school_memberships")
      .update({ approved: true })
      .eq("id", membership.id);
  }

  return userId;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const { schoolSlug } = parsed.data;

  if (rateLimited(`${schoolSlug}:${email}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();

  const { data: school } = await admin
    .from("schools")
    .select("id, slug, name, blackbaud_verification_enabled")
    .eq("slug", schoolSlug)
    .maybeSingle();

  // Unknown school or feature off: same generic response. Anything else would
  // disclose which schools have verification configured.
  if (!school?.blackbaud_verification_enabled) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const match = await findRosterMatch(school.id, email);

  if (!match) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const userId = await ensureVerifiedParent(admin, email, school.id, {
    first: match.first_name,
    last: match.last_name,
  });

  if (!userId) {
    // Provisioning failed. Still generic to the caller — the detail is logged.
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const origin = new URL(request.url).origin;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${origin}/auth/callback?school_slug=${encodeURIComponent(school.slug)}`,
    },
  });

  if (linkError || !link.properties?.action_link) {
    console.error(`[blackbaud-verify] link generation failed: ${linkError?.message}`);
    return NextResponse.json(GENERIC_RESPONSE);
  }

  await sendEmail(
    email,
    `Sign in to ${school.name}`,
    signInEmailHtml(school.name, link.properties.action_link)
  );

  return NextResponse.json(GENERIC_RESPONSE);
}
