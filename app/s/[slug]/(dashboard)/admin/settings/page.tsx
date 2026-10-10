import { requireSchoolContext } from "@/lib/school-context";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureInboundAddresses, type InboundAddresses } from "@/lib/email/addresses";
import { SettingsClient } from "./client";
import { PageTransition } from "@/components/motion";
import type {
  BlackbaudConfig,
  BlackbaudCallbackResult,
  EmailIngestionLogEntry,
} from "./client";
import type { BlackbaudCalendarFeed, EventCalendar } from "@/lib/types";

const CALLBACK_RESULTS: readonly string[] = ["connected", "denied", "error"];

function parseCallbackResult(value?: string): BlackbaudCallbackResult {
  return value && CALLBACK_RESULTS.includes(value)
    ? (value as BlackbaudCallbackResult)
    : null;
}

/**
 * Connection status comes from the blackbaud_connection_status view, never the
 * base table — 022 dropped the base table's SELECT policy precisely so the
 * encrypted token columns cannot reach a browser. The roster count goes through
 * the admin client because blackbaud_roster has no RLS policies at all.
 */
async function loadBlackbaudConfig(
  schoolId: string,
  verificationEnabled: boolean
): Promise<BlackbaudConfig> {
  const supabase = await createClient();

  const [
    { data: connection },
    { count },
    { data: feeds },
    { data: mappings },
    { data: eventCalendars },
    { data: pending },
  ] = await Promise.all([
    supabase
      .from("blackbaud_connection_status")
      .select("status, last_synced_at, last_error, environment_id")
      .eq("school_id", schoolId)
      .maybeSingle(),
    createAdminClient()
      .from("blackbaud_roster")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("is_active", true),
    supabase
      .from("blackbaud_calendar_feeds")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true }),
    supabase
      .from("blackbaud_calendar_mappings")
      .select("source_value, calendar_id")
      .eq("school_id", schoolId)
      .eq("source_kind", "feed"),
    supabase
      .from("event_calendars")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("blackbaud_events")
      .select("feed_id")
      .eq("school_id", schoolId)
      .eq("status", "pending"),
  ]);

  const mappedByFeed = new Map<string, string[]>();
  for (const row of mappings ?? []) {
    const feedId = row.source_value as string;
    mappedByFeed.set(feedId, [
      ...(mappedByFeed.get(feedId) ?? []),
      row.calendar_id as string,
    ]);
  }

  const pendingByFeed = new Map<string, number>();
  for (const row of pending ?? []) {
    const feedId = row.feed_id as string;
    pendingByFeed.set(feedId, (pendingByFeed.get(feedId) ?? 0) + 1);
  }

  return {
    verificationEnabled,
    rosterCount: count ?? 0,
    connection: connection
      ? {
          status: connection.status,
          lastSyncedAt: connection.last_synced_at,
          lastError: connection.last_error,
          environmentId: connection.environment_id,
        }
      : null,
    calendarFeeds: (feeds ?? []).map((feed) => ({
      ...(feed as BlackbaudCalendarFeed),
      mappedCalendarIds: mappedByFeed.get(feed.id as string) ?? [],
      pendingCount: pendingByFeed.get(feed.id as string) ?? 0,
    })),
    eventCalendars: (eventCalendars ?? []) as EventCalendar[],
  };
}

/** Latest inbound-email attempts, so admins can see what was accepted or why
 * something was turned away, plus every email still waiting for review (so a
 * held email can't scroll out of reach). RLS limits rows to this school's
 * admins. */
async function loadRecentEmails(
  schoolId: string
): Promise<EmailIngestionLogEntry[]> {
  const supabase = await createClient();
  const columns = "id, from_address, subject, status, reason, document_ids, created_at";
  const [{ data: recent }, { data: pending }] = await Promise.all([
    supabase
      .from("email_ingestions")
      .select(columns)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("email_ingestions")
      .select(columns)
      .eq("school_id", schoolId)
      .eq("status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const byId = new Map<string, NonNullable<typeof recent>[number]>();
  for (const row of [...(pending ?? []), ...(recent ?? [])]) byId.set(row.id, row);

  return [...byId.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({
      id: row.id,
      fromAddress: row.from_address,
      subject: row.subject,
      status: row.status,
      reason: row.reason,
      documentCount: (row.document_ids ?? []).length,
      createdAt: row.created_at,
    }));
}

/**
 * The school's inbound addresses: the whole-school one and one per division,
 * plus the divisions themselves. With ingestion on, any that are missing are
 * created, so the school always has all of them.
 */
async function loadInboundAddresses(
  schoolId: string,
  ingestionEnabled: boolean
): Promise<InboundAddresses & { addressesError: string | null }> {
  const supabase = await createClient();
  try {
    if (ingestionEnabled) {
      return {
        ...(await ensureInboundAddresses(supabase, schoolId)),
        addressesError: null,
      };
    }
    const [{ data: addresses, error }, { data: divisions }] = await Promise.all([
      supabase
        .from("email_ingestion_addresses")
        .select("id, token, division_id")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: true }),
      supabase
        .from("event_calendars")
        .select("*")
        .eq("school_id", schoolId)
        .eq("kind", "division")
        .order("sort_order", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    return {
      addressesError: null,
      wholeSchoolToken:
        (addresses ?? []).find((a) => a.division_id === null)?.token ?? null,
      divisionAddresses: (addresses ?? [])
        .filter((a) => a.division_id !== null)
        .map((a) => ({ id: a.id, token: a.token, divisionId: a.division_id })),
      divisions: (divisions ?? []) as EventCalendar[],
    };
  } catch (err) {
    console.error(
      "[settings] Loading inbound addresses failed:",
      err instanceof Error ? err.message : err
    );
    return {
      wholeSchoolToken: null,
      divisionAddresses: [],
      divisions: [],
      addressesError:
        "Your email addresses couldn't be loaded. If the database migration 028_division_email_addresses.sql hasn't been applied yet, apply it and reload.",
    };
  }
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ blackbaud?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const { blackbaud, tab } = await searchParams;
  const { school } = await requireSchoolContext(slug);

  const [settings, blackbaudConfig, recentEmails, inboundAddresses] =
    await Promise.all([
      loadSettings(school.id),
      loadBlackbaudConfig(
        school.id,
        school.blackbaud_verification_enabled ?? false
      ),
      loadRecentEmails(school.id),
      loadInboundAddresses(school.id, school.email_ingestion_enabled ?? false),
    ]);

  return (
    <PageTransition>
      <SettingsClient
        settings={settings}
        schoolId={school.id}
        schoolSlug={slug}
        emailIngestion={{
          enabled: school.email_ingestion_enabled ?? false,
          autoSort: school.auto_sort_enabled ?? true,
          allowedDomains: school.allowed_sender_domains ?? [],
          ...inboundAddresses,
          inboundDomain: process.env.INBOUND_EMAIL_DOMAIN ?? null,
          recent: recentEmails,
        }}
        blackbaud={blackbaudConfig}
        blackbaudCallback={parseCallbackResult(blackbaud)}
        initialTab={tab}
      />
    </PageTransition>
  );
}
