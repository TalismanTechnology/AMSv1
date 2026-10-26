// Data for the Settings section pages. Each page loads only what it shows;
// the queries are the ones the single Settings page used to run all at once.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureInboundAddresses, type InboundAddresses } from "@/lib/email/addresses";
import type {
  BlackbaudConfig,
  BlackbaudCallbackResult,
} from "@/components/admin/settings/blackbaud-settings";
import type { EmailIngestionLogEntry } from "@/components/admin/settings/email-ingestion";
import type { BlackbaudCalendarFeed, EventCalendar } from "@/lib/types";
import type { WebsiteSourceView } from "@/components/admin/website-sources";
import type { ParentSignInConfig } from "@/components/admin/parent-sign-in-settings";
import type { School } from "@/lib/types";
import { resolveAuthProvider } from "@/lib/auth/provider";
import { getRosterSummary } from "@/lib/roster/store";
import { isRosterMatchRequired } from "@/lib/roster/gate";
import { getVeracrossConnection } from "@/lib/veracross/connection";
import type { ContactsDirectoryData } from "@/components/admin/contacts-directory";
import {
  CONTACTS_TABLE_MISSING_MESSAGE,
  isMissingTableError,
  type SchoolContact,
} from "@/lib/contacts/directory";

const CALLBACK_RESULTS: readonly string[] = ["connected", "denied", "error"];

export function parseCallbackResult(value?: string): BlackbaudCallbackResult {
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
export async function loadBlackbaudConfig(
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
export async function loadRecentEmails(
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
export async function loadInboundAddresses(
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

/**
 * The school's website sources, with progress for any sync in flight (queue
 * rows handled vs queued this run). RLS limits rows to this school's admins.
 */
export async function loadWebsiteSources(
  schoolId: string
): Promise<{ sources: WebsiteSourceView[]; loadError: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_sources")
    .select(
      "id, root_url, include_patterns, exclude_patterns, max_pages, enabled, current_run, last_sync_started_at, last_sync_finished_at, last_sync_status, last_sync_error, page_count"
    )
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[settings] Loading website sources failed:", error.message);
    return {
      sources: [],
      loadError:
        "Website sources couldn't be loaded. If the database migration 038_website_sources.sql hasn't been applied yet, apply it and reload.",
    };
  }

  const sources = await Promise.all(
    (data ?? []).map(async (row): Promise<WebsiteSourceView> => {
      let progress: WebsiteSourceView["progress"] = null;
      if (row.last_sync_status === "running") {
        const queue = () =>
          supabase
            .from("website_sync_queue")
            .select("id", { count: "exact", head: true })
            .eq("source_id", row.id)
            .eq("run", row.current_run)
            .eq("kind", "page");
        const [{ count: total }, { count: pending }] = await Promise.all([
          queue(),
          queue().eq("status", "pending"),
        ]);
        progress = { total: total ?? 0, processed: (total ?? 0) - (pending ?? 0) };
      }
      return {
        id: row.id,
        rootUrl: row.root_url,
        includePatterns: row.include_patterns ?? [],
        excludePatterns: row.exclude_patterns ?? [],
        maxPages: row.max_pages,
        enabled: row.enabled,
        lastSyncStartedAt: row.last_sync_started_at,
        lastSyncFinishedAt: row.last_sync_finished_at,
        lastSyncStatus: row.last_sync_status,
        lastSyncError: row.last_sync_error,
        pageCount: row.page_count ?? 0,
        progress,
      };
    })
  );

  return { sources, loadError: null };
}

/**
 * Parent sign-in provider, uploaded roster and the require-roster-match gate.
 * Before migration 045 the roster table is missing and the panel says so
 * instead of offering controls.
 */
export async function loadParentSignInConfig(school: School): Promise<ParentSignInConfig> {
  const [summary, veracross] = await Promise.all([
    getRosterSummary(school.id).catch((err: unknown) => {
      console.error(
        "[settings] Loading parent roster failed:",
        err instanceof Error ? err.message : err
      );
      return null;
    }),
    getVeracrossConnection(school.id),
  ]);

  return {
    installed: summary !== null && summary.installed,
    loadError: summary === null ? "The parent roster couldn't be loaded. Reload to try again." : null,
    provider: resolveAuthProvider(school.auth_provider),
    veracrossAvailable: Boolean(veracross),
    rosterActiveCount: summary?.installed ? summary.activeCount : 0,
    rosterUpdatedAt: summary?.installed ? summary.lastUpdatedAt : null,
    requireRosterMatch: isRosterMatchRequired(school),
  };
}

/**
 * The staff contact directory (approved and suggested; rejected rows are kept
 * only so they aren't suggested again) and the school's divisions. RLS limits
 * rows to this school's admins. Migration 044 not applied yet → an empty
 * directory with a notice.
 */
export async function loadContacts(schoolId: string): Promise<ContactsDirectoryData> {
  const supabase = await createClient();
  const [{ data, error }, { data: divisions }] = await Promise.all([
    supabase
      .from("school_contacts")
      .select("*, source_document:documents(title)")
      .eq("school_id", schoolId)
      .in("status", ["approved", "suggested"])
      .order("created_at", { ascending: true }),
    supabase
      .from("event_calendars")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("kind", "division")
      .order("sort_order", { ascending: true }),
  ]);

  const base = { divisions: divisions ?? [], contacts: [] };
  if (error) {
    if (isMissingTableError(error)) {
      return { ...base, loadError: CONTACTS_TABLE_MISSING_MESSAGE, tableMissing: true };
    }
    console.error("[settings] Loading contacts failed:", error.message);
    return { ...base, loadError: "Contacts couldn't be loaded.", tableMissing: false };
  }

  return {
    ...base,
    loadError: null,
    tableMissing: false,
    contacts: (data ?? []).map((row) => {
      const { source_document, ...contact } = row as SchoolContact & {
        source_document: { title: string | null } | null;
      };
      return {
        ...contact,
        topics: contact.topics ?? [],
        source_document_title: source_document?.title ?? null,
      };
    }),
  };
}
