"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimeAgo } from "@/components/ui/time-ago";
import { updateEmailIngestion } from "@/actions/settings";
import { approveHeldEmail, rejectHeldEmail } from "@/actions/email-review";
import { toast } from "sonner";
import type { InboundAddresses } from "@/lib/email/addresses";
import type { Folder } from "@/lib/types";
import { IntakeAddressList } from "@/components/admin/settings/intake-addresses";

export interface EmailIngestionLogEntry {
  id: string;
  fromAddress: string | null;
  subject: string | null;
  status: string;
  reason: string | null;
  documentCount: number;
  createdAt: string;
}

export interface EmailIngestionConfig extends InboundAddresses {
  enabled: boolean;
  autoSort: boolean;
  /** Set when the addresses couldn't be loaded, saying why. */
  addressesError: string | null;
  inboundDomain: string | null;
  /** The school's folders, for an address's default folder. */
  folders: Folder[];
  recent: EmailIngestionLogEntry[];
}

export function EmailIngestionSection({
  schoolId,
  config,
}: {
  schoolId: string;
  config: EmailIngestionConfig;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [autoSort, setAutoSort] = useState(config.autoSort);
  const [addresses, setAddresses] = useState<InboundAddresses>(config);
  const [saving, setSaving] = useState(false);

  const addressFor = (t: string | null) =>
    t && config.inboundDomain ? `${t}@${config.inboundDomain}` : null;
  const inboundAddress = addressFor(addresses.wholeSchoolToken);

  async function handleSave() {
    setSaving(true);
    const result = await updateEmailIngestion(schoolId, {
      enabled,
      autoSort,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.addresses) setAddresses(result.addresses);
    toast.success("Email settings saved");
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Email Ingestion</h2>
        <p className="text-sm text-muted-foreground">
          Forward school emails to a private address and they become documents
          automatically — attachments and the message body, sorted by AI.
        </p>
      </div>
      <div className="space-y-5">
        <div id="setting-email-ingestion" className="flex scroll-mt-6 items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="email-ingestion-enabled">Enable email ingestion</Label>
            <p className="text-xs text-muted-foreground">
              Accept emails at your school&apos;s private inbound addresses.
            </p>
          </div>
          <Switch
            id="email-ingestion-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {(enabled || addresses.wholeSchoolToken) && (
          <div
            id="setting-inbound-addresses"
            className="scroll-mt-6 space-y-4"
          >
            {config.addressesError ? (
              <AddressNotice>{config.addressesError}</AddressNotice>
            ) : !config.inboundDomain ? (
              <AddressNotice>
                Addresses can&apos;t be shown because INBOUND_EMAIL_DOMAIN
                isn&apos;t set on the server. Add it under Vercel → Settings →
                Environment Variables and redeploy.
              </AddressNotice>
            ) : !inboundAddress ? (
              <AddressNotice>
                Save email settings to create your addresses.
              </AddressNotice>
            ) : (
              <>
                {!enabled && (
                  <AddressNotice>
                    Email ingestion is off, so mail sent to these addresses is
                    turned away until you switch it on and save.
                  </AddressNotice>
                )}
                <IntakeAddressList
                  key={addresses.addresses.map((a) => a.id).join(",")}
                  schoolId={schoolId}
                  addresses={addresses.addresses}
                  divisions={addresses.divisions}
                  folders={config.folders}
                  inboundDomain={config.inboundDomain}
                />
              </>
            )}
          </div>
        )}

        <div id="setting-auto-sort" className="flex scroll-mt-6 items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="auto-sort">Auto-sort into categories &amp; folders</Label>
            <p className="text-xs text-muted-foreground">
              Let AI file unsorted documents into your existing categories and
              folders.
            </p>
          </div>
          <Switch id="auto-sort" checked={autoSort} onCheckedChange={setAutoSort} />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <LogoSpinner className="mr-2" />}
            Save email settings
          </Button>
        </div>

        <RecentEmails schoolId={schoolId} entries={config.recent} />
      </div>
    </section>
  );
}

/** A short, highlighted message in place of the addresses. */
function AddressNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-ink-soft">
      {children}
    </p>
  );
}

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  accepted: { label: "Added", className: "bg-success/15 text-success" },
  processing: { label: "Processing", className: "bg-amber-500/15 text-amber-500" },
  pending_review: {
    label: "Needs review",
    className: "bg-amber-500/15 text-amber-500",
  },
  rejected_review: {
    label: "Rejected",
    className: "bg-secondary text-secondary-foreground",
  },
  rejected_domain: {
    label: "Sender not allowed",
    className: "bg-destructive/15 text-destructive",
  },
  rejected_disabled: {
    label: "Turned away (off)",
    className: "bg-secondary text-secondary-foreground",
  },
  duplicate: { label: "Duplicate", className: "bg-secondary text-secondary-foreground" },
  error: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

function RecentEmails({
  schoolId,
  entries,
}: {
  schoolId: string;
  entries: EmailIngestionLogEntry[];
}) {
  // Statuses changed here, shown until the page's data refreshes.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function review(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    const result =
      decision === "approve"
        ? await approveHeldEmail(schoolId, id)
        : await rejectHeldEmail(schoolId, id);
    setBusyId(null);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setOverrides((prev) => ({
      ...prev,
      [id]: decision === "approve" ? "accepted" : "rejected_review",
    }));
    toast.success(
      decision === "approve"
        ? `Email approved${result.documents ? ` · ${result.documents} document${result.documents === 1 ? "" : "s"} added` : ""}`
        : "Email rejected"
    );
  }

  const pendingCount = entries.filter(
    (e) => (overrides[e.id] ?? e.status) === "pending_review"
  ).length;

  return (
    <div id="setting-recent-emails" className="scroll-mt-6 space-y-2 border-t border-border pt-5">
      <div className="space-y-0.5">
        <Label>Recent emails</Label>
        <p className="text-xs text-muted-foreground">
          The last 20 emails sent to your inbound addresses and what happened
          to each. Emails marked &ldquo;Needs review&rdquo; aren&apos;t visible to
          parents until you approve them.
        </p>
        {pendingCount > 0 && (
          <p className="text-xs font-medium text-amber-500">
            {pendingCount} email{pendingCount === 1 ? "" : "s"} waiting for review
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No emails received yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => {
            const statusKey = overrides[entry.id] ?? entry.status;
            const status = EMAIL_STATUS[statusKey] ?? {
              label: statusKey,
              className: "bg-secondary text-secondary-foreground",
            };
            const detail =
              statusKey === "accepted" && !overrides[entry.id]
                ? `${entry.documentCount} document${entry.documentCount === 1 ? "" : "s"} added`
                : overrides[entry.id]
                  ? null
                  : entry.reason;
            const pending = statusKey === "pending_review";
            const busy = busyId === entry.id;
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    {entry.subject || "(no subject)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.fromAddress ?? "Unknown sender"}
                  </p>
                  {detail && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {detail}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pending && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={busyId !== null}
                        onClick={() => review(entry.id, "reject")}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={busyId !== null}
                        onClick={() => review(entry.id, "approve")}
                      >
                        {busy && <LogoSpinner className="mr-1.5" />}
                        Approve
                      </Button>
                    </>
                  )}
                  <Badge className={status.className}>{status.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <TimeAgo date={entry.createdAt} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
