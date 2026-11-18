import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { schoolAccessErrorStatus, schoolLockError } from "@/lib/school-lock/access";
import { buildIcs, icsContentDisposition, icsPath, type CalendarEventInput } from "@/lib/calendar/ics";
import { icsSigningKey, issueIcsToken, verifyIcsToken } from "@/lib/calendar/ics-token";

// One school event as an .ics file, for "Add to calendar → Apple Calendar".
//
// GET  /api/events/:id/ics[?end=YYYY-MM-DD]
//   Signed-in member of the event's school (session cookie). RLS decides
//   visibility, so an event from another school is a 404, the same as one
//   that doesn't exist: we never confirm another school's event exists.
//   `end` (chat citations of a multi-day range) only stretches this event's
//   own dates.
// GET  /api/events/:id/ics?t=<token>[&end=…]
//   The same file for Safari, opened from the iOS app without its cookies;
//   the token is bound to one user and this event and lasts minutes
//   (lib/calendar/ics-token.ts). Membership is checked again on use.
// POST /api/events/:id/ics
//   Cookie auth as for GET; returns { url } with a fresh token.

const EVENT_COLUMNS = "id, title, description, date, start_time, end_time, location, school_id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventRow = Omit<CalendarEventInput, "date_end"> & { school_id: string };

const error = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/** The event if the signed-in user may add it to their calendar, else an error response. */
async function eventForSession(id: string): Promise<{ userId: string; event: EventRow } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("Unauthorized", 401);

  if (!UUID_PATTERN.test(id)) return error("Not found", 404);
  // RLS: members of the event's school (and the super-admin) only.
  const { data: event } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle<EventRow>();
  if (!event) return error("Not found", 404);

  // The school's owner lock (only ever affects a super-admin), and
  // ADMIN_GOOGLE_ONLY for staff.
  const locked = await schoolLockError(event.school_id, "member", user.id);
  if (locked) return error(locked, schoolAccessErrorStatus(locked));

  return { userId: user.id, event };
}

/** The event for a signed link, re-checking the user still belongs to its school. */
async function eventForToken(id: string, token: string): Promise<EventRow | NextResponse> {
  const key = icsSigningKey();
  const claims = key && UUID_PATTERN.test(id) ? verifyIcsToken(token, { eventId: id }, key) : null;
  // Expired or not ours: the user just needs to tap again in the app.
  if (!claims) return error("This link has expired. Go back and tap Add to calendar again.", 401);

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle<EventRow>();
  if (!event) return error("Not found", 404);

  const [{ data: membership }, { data: profile }] = await Promise.all([
    admin
      .from("school_memberships")
      .select("approved")
      .eq("user_id", claims.userId)
      .eq("school_id", event.school_id)
      .maybeSingle(),
    admin.from("profiles").select("role").eq("id", claims.userId).maybeSingle(),
  ]);
  // The owner lock was checked when the link was issued (it needs the
  // web view's unlock cookie, which Safari doesn't have).
  if (!membership?.approved && profile?.role !== "super_admin") return error("Forbidden", 403);

  return event;
}

function rangeEnd(request: NextRequest): string | null {
  const end = request.nextUrl.searchParams.get("end");
  return end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("t");

  let event: EventRow;
  if (token) {
    const result = await eventForToken(id, token);
    if (result instanceof NextResponse) return result;
    event = result;
  } else {
    const result = await eventForSession(id);
    if (result instanceof NextResponse) return result;
    event = result.event;
  }

  const body = buildIcs({ ...event, date_end: rangeEnd(request) });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Inline, not attachment: iOS Safari previews a text/calendar response
      // served inline as an event with "Add to Calendar", while an attachment
      // gets a "Download?" prompt and lands in Files, a detour away from
      // Calendar. Desktop browsers can't render text/calendar, so they
      // download it (or, in Safari on a Mac, offer Calendar) either way, and
      // the filename still applies.
      "Content-Disposition": icsContentDisposition(event.title),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await eventForSession(id);
  if (result instanceof NextResponse) return result;

  const key = icsSigningKey();
  if (!key) return error("Calendar links aren't available right now", 500);

  const token = issueIcsToken(result.userId, result.event.id, key);
  const url = new URL(icsPath(result.event.id, { end: rangeEnd(request), token }), request.nextUrl.origin);
  return NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
}
