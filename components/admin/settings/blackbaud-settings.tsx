"use client";

import { useEffect, useState } from "react";
import { X, RefreshCw, ExternalLink } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { syncBlackbaudRoster } from "@/actions/blackbaud";
import {
  BlackbaudCalendarFeeds,
  type FeedWithMapping,
} from "@/components/admin/blackbaud-calendar-feeds";
import { toast } from "sonner";
import type { EventCalendar } from "@/lib/types";

export type BlackbaudCallbackResult = "connected" | "denied" | "error" | null;

export interface BlackbaudConnection {
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  environmentId: string | null;
}

export interface BlackbaudConfig {
  verificationEnabled: boolean;
  rosterCount: number;
  connection: BlackbaudConnection | null;
  // Calendar feeds are independent of the OAuth connection above: Blackbaud
  // exposes school calendars as iCal subscriptions, not through the SKY API,
  // so a school can sync events without authorizing the app at all.
  calendarFeeds: FeedWithMapping[];
  eventCalendars: EventCalendar[];
}

const CALLBACK_MESSAGES: Record<
  Exclude<BlackbaudCallbackResult, null>,
  { tone: "good" | "bad"; title: string; body: string }
> = {
  connected: {
    tone: "good",
    title: "Blackbaud connected",
    body: "Run a sync to pull this school's parent roster across.",
  },
  denied: {
    tone: "bad",
    title: "Authorization declined",
    body: "The consent screen was cancelled, so nothing was connected.",
  },
  error: {
    tone: "bad",
    title: "Authorization failed",
    body: "Blackbaud rejected the request or the session expired. Try connecting again.",
  },
};

// status -> how the panel reads. Anything unrecognized falls through to the
// "unknown" row rather than rendering a blank dot.
const STATUS_PRESENTATION: Record<
  string,
  { label: string; dot: string; detail: string }
> = {
  connected: {
    label: "Connected",
    dot: "bg-emerald-500",
    detail: "Roster syncs nightly.",
  },
  expired: {
    label: "Authorization expired",
    dot: "bg-amber-500",
    detail: "Reconnect to restore roster syncing.",
  },
  error: {
    label: "Sync error",
    dot: "bg-red-500",
    detail: "The last sync did not complete.",
  },
};

export function BlackbaudSection({
  schoolId,
  schoolSlug,
  config,
  callback,
}: {
  schoolId: string;
  schoolSlug: string;
  config: BlackbaudConfig;
  callback: BlackbaudCallbackResult;
}) {
  const [rosterCount, setRosterCount] = useState(config.rosterCount);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(callback);

  // The callback lands here as ?blackbaud=... — read it once, then drop it so a
  // refresh or a shared URL doesn't replay a stale outcome.
  useEffect(() => {
    if (!callback) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("blackbaud");
    window.history.replaceState(null, "", url.toString());
  }, [callback]);

  const connection = config.connection;
  const presentation = connection
    ? STATUS_PRESENTATION[connection.status] ?? {
        label: connection.status,
        dot: "bg-muted-foreground",
        detail: "Unrecognized connection state.",
      }
    : null;

  async function handleSync() {
    setSyncing(true);
    const result = await syncBlackbaudRoster(schoolId);
    setSyncing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRosterCount(result.upserted ?? 0);
    toast.success(
      `Synced ${result.upserted ?? 0} parents${
        result.deactivated ? ` · ${result.deactivated} deactivated` : ""
      }`
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Blackbaud</h2>
        <p className="text-sm text-muted-foreground">
          Connect your school&apos;s Blackbaud environment to verify parents
          against the official guardian roster before granting access.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 rounded-lg border bg-card p-4 ${
            CALLBACK_MESSAGES[notice].tone === "good"
              ? "border-emerald-500/40"
              : "border-red-500/40"
          }`}
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-ink">
              {CALLBACK_MESSAGES[notice].title}
            </p>
            <p className="text-xs text-muted-foreground">
              {CALLBACK_MESSAGES[notice].body}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="space-y-5">
        <div
          id="setting-blackbaud-connection"
          className="scroll-mt-6 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${
                    presentation ? presentation.dot : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-sm font-medium text-ink">
                  {presentation ? presentation.label : "Not connected"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {presentation
                  ? presentation.detail
                  : "No Blackbaud environment is linked to this school yet."}
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-ink tracking-[-0.02em]">
                {rosterCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {rosterCount === 1 ? "parent on roster" : "parents on roster"}
              </p>
            </div>
          </div>

          {connection && (
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last synced</dt>
                <dd className="text-ink-soft">
                  {connection.lastSyncedAt ? (
                    <TimeAgo date={connection.lastSyncedAt} />
                  ) : (
                    "Never"
                  )}
                </dd>
              </div>
              {connection.environmentId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd className="font-mono text-ink-soft">
                    {connection.environmentId}
                  </dd>
                </div>
              )}
              {connection.lastError && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">Last error</dt>
                  <dd className="break-words text-right text-red-500">
                    {connection.lastError}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {/* Full page navigation on purpose — the route 302s to Blackbaud. */}
            <Button asChild variant={connection ? "outline" : "default"}>
              <a
                href={`/api/blackbaud/connect?school=${encodeURIComponent(
                  schoolSlug
                )}`}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {connection ? "Reconnect Blackbaud" : "Connect Blackbaud"}
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={!connection || syncing}
            >
              {syncing ? (
                <LogoSpinner className="mr-2" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync now
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Parents sign in with Blackbaud. Only accounts your Blackbaud records
          mark as parents can get in.
        </p>

        <BlackbaudCalendarFeeds
          schoolId={schoolId}
          schoolSlug={schoolSlug}
          feeds={config.calendarFeeds}
          calendars={config.eventCalendars}
        />
      </div>
    </section>
  );
}
