"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimeAgo } from "@/components/ui/time-ago";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  previewRosterUpload,
  updateParentSignInProvider,
  updateRequireRosterMatch,
  uploadRoster,
} from "@/actions/parent-sign-in";
import type { AuthProvider } from "@/lib/auth/provider";
import {
  MAX_ROSTER_BYTES,
  ROSTER_TEMPLATE_CSV,
  ROSTER_TOO_LARGE,
  parseRosterCsv,
  type RosterParseResult,
  type RowIssue,
} from "@/lib/roster/csv";
import { formatGrade } from "@/lib/grades";
import { cn } from "@/lib/utils";

export interface ParentSignInConfig {
  /** Migration 044 applied (school_roster exists). */
  installed: boolean;
  /** Set when the roster couldn't be read for another reason. */
  loadError: string | null;
  provider: AuthProvider;
  /** An enabled Veracross OAuth Application exists for this school. */
  veracrossAvailable: boolean;
  rosterActiveCount: number;
  rosterUpdatedAt: string | null;
  requireRosterMatch: boolean;
}

const PROVIDER_OPTIONS: { value: AuthProvider; label: string; description: string }[] = [
  {
    value: "blackbaud",
    label: "Blackbaud",
    description: "Parents use their Blackbaud parent portal login.",
  },
  {
    value: "veracross",
    label: "Veracross",
    description: "Parents use their Veracross portal login.",
  },
  {
    value: "roster",
    label: "Email code",
    description: "Parents on your roster get a 6-digit code by email.",
  },
];

const PROVIDER_PHRASE: Record<AuthProvider, string> = {
  blackbaud: "Blackbaud",
  veracross: "Veracross",
  roster: "a code emailed to the address on your roster",
};

const SUPPORT_NOTE = "Contact AskMySchool support to change how parents sign in.";

const PREVIEW_PARENTS = 20;
const PREVIEW_ISSUES = 50;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([ROSTER_TEMPLATE_CSV], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "parent-roster-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function ParentSignInSettings({
  schoolId,
  config,
  isSuperAdmin,
}: {
  schoolId: string;
  config: ParentSignInConfig;
  /** Only super admins may change the provider or turn the roster gate on. */
  isSuperAdmin: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Parent sign-in</h2>
        <p className="text-sm text-muted-foreground">
          Choose how parents sign in, and keep the list of parents allowed to
          use AskMySchool.
        </p>
      </div>

      {!config.installed ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium text-ink">
            Parents sign in with {PROVIDER_OPTIONS.find((o) => o.value === config.provider)?.label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {config.loadError ??
              "Roster sign-in will be available after the next database update."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <ProviderCard schoolId={schoolId} config={config} isSuperAdmin={isSuperAdmin} />
          <RosterCard schoolId={schoolId} config={config} />
          <GateCard schoolId={schoolId} config={config} isSuperAdmin={isSuperAdmin} />
        </div>
      )}
    </section>
  );
}

function ProviderCard({
  schoolId,
  config,
  isSuperAdmin,
}: {
  schoolId: string;
  config: ParentSignInConfig;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<AuthProvider | null>(null);
  const [saving, setSaving] = useState(false);

  const disabledReason = (provider: AuthProvider): string | null => {
    if (provider === "veracross" && !config.veracrossAvailable) {
      return "Veracross isn't connected for this school yet.";
    }
    if (provider === "roster" && config.rosterActiveCount === 0) {
      return "Upload a parent roster first.";
    }
    return null;
  };

  async function confirmChange() {
    if (!pending) return;
    setSaving(true);
    const result = await updateParentSignInProvider(schoolId, pending);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Parent sign-in updated");
    setPending(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Sign-in method</legend>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Staff always sign in with their email and password.
          {isSuperAdmin ? "" : ` ${SUPPORT_NOTE}`}
        </p>
        <div className="mt-4 space-y-2">
          {PROVIDER_OPTIONS.map((option) => {
            const checked = option.value === config.provider;
            const reason = checked ? null : disabledReason(option.value);
            const locked = !checked && (!isSuperAdmin || Boolean(reason));
            return (
              <label
                key={option.value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  checked ? "border-primary/60 bg-primary/5" : "border-border",
                  locked
                    ? "cursor-not-allowed opacity-60"
                    : isSuperAdmin && "cursor-pointer hover:bg-secondary/50"
                )}
              >
                <input
                  type="radio"
                  name="parent-sign-in-provider"
                  value={option.value}
                  checked={checked}
                  disabled={locked || saving}
                  onChange={() => setPending(option.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {reason ?? option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !saving && setPending(null)}
        title="Change parent sign-in?"
        description={
          pending
            ? `Parents will sign in with ${PROVIDER_PHRASE[pending]} from now on. Parents who are already signed in stay signed in.`
            : ""
        }
        confirmLabel="Change sign-in"
        variant="default"
        loading={saving}
        onConfirm={confirmChange}
      />
    </div>
  );
}

function IssueList({ title, issues, total }: { title: string; issues: RowIssue[]; total: number }) {
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-ink">{title}</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/40 p-3 text-xs text-ink-soft">
        {issues.slice(0, PREVIEW_ISSUES).map((issue, index) => (
          <li key={`${issue.line}-${index}`} className="break-words">
            <span className="font-mono text-muted-foreground">Line {issue.line}:</span>{" "}
            {issue.message}
          </li>
        ))}
        {total > PREVIEW_ISSUES && (
          <li className="text-muted-foreground">
            …and {(total - PREVIEW_ISSUES).toLocaleString()} more
          </li>
        )}
      </ul>
    </div>
  );
}

function RosterCard({ schoolId, config }: { schoolId: string; config: ParentSignInConfig }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterParseResult | null>(null);
  const [confirm, setConfirm] = useState<{ deactivated: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    // The text goes to a server action, which has a 1 MB body limit.
    if (file.size > MAX_ROSTER_BYTES) {
      clearFile();
      toast.error(ROSTER_TOO_LARGE);
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setPreview(parseRosterCsv(text));
  }

  function clearFile() {
    setFileName(null);
    setCsvText(null);
    setPreview(null);
    setInputKey((key) => key + 1);
  }

  async function startReplace() {
    if (!preview) return;
    setChecking(true);
    const result = await previewRosterUpload(
      schoolId,
      preview.parents.map((parent) => parent.email)
    );
    setChecking(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setConfirm({ deactivated: result.deactivated ?? 0 });
  }

  async function replace() {
    if (!csvText) return;
    setUploading(true);
    const result = await uploadRoster(schoolId, csvText);
    setUploading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setConfirm(null);
    clearFile();
    toast.success(
      `Roster saved: ${plural(result.activeCount ?? 0, "parent", "parents")} active` +
        (result.deactivated ? ` · ${result.deactivated.toLocaleString()} deactivated` : "") +
        (result.skippedRows ? ` · ${plural(result.skippedRows, "row", "rows")} skipped` : "")
    );
    router.refresh();
  }

  const usable = preview && !preview.fatal && preview.parents.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Parent roster</p>
          <p className="text-xs text-muted-foreground">
            {config.rosterUpdatedAt ? (
              <>
                Last updated <TimeAgo date={config.rosterUpdatedAt} />
              </>
            ) : (
              "No roster uploaded yet."
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-ink tracking-[-0.02em]">
            {config.rosterActiveCount.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {config.rosterActiveCount === 1 ? "active parent" : "active parents"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Upload a CSV with one row per parent or one row per child. It needs an
        email column; parent names, child names and grades are optional.
        Uploading replaces the list: parents missing from the new file are
        deactivated, not deleted.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <label className="cursor-pointer focus-within:ring-2 focus-within:ring-ring/50">
            <Upload className="mr-2 h-4 w-4" />
            {fileName ? "Choose another file" : "Choose CSV file"}
            <input
              key={inputKey}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Download template CSV
        </Button>
      </div>

      {preview && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <p className="break-all text-xs text-muted-foreground">{fileName}</p>

          {preview.fatal ? (
            <p role="alert" className="rounded-md border border-red-500/40 p-3 text-sm text-red-500">
              {preview.fatal}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Parents", preview.stats.parents],
                  ["Children", preview.stats.children],
                  ["Rows with errors", preview.stats.rowsWithErrors],
                  ["Warnings", preview.warnings.length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-ink">
                      {(value as number).toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>

              {preview.parents.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="bg-secondary/60 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Children</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.parents.slice(0, PREVIEW_PARENTS).map((parent) => (
                        <tr key={parent.email} className="border-t border-border align-top">
                          <td className="break-all px-3 py-2 text-ink">{parent.email}</td>
                          <td className="px-3 py-2 text-ink-soft">
                            {[parent.firstName, parent.lastName].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-soft">
                            {parent.children.length === 0
                              ? "—"
                              : parent.children
                                  .map((child) =>
                                    child.grade
                                      ? `${child.name} (${formatGrade(child.grade)})`
                                      : child.name
                                  )
                                  .join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.parents.length > PREVIEW_PARENTS && (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Showing {PREVIEW_PARENTS} of {preview.parents.length.toLocaleString()} parents.
                    </p>
                  )}
                </div>
              )}

              <IssueList
                title="Rows that will be skipped"
                issues={preview.errors}
                total={preview.errors.length}
              />
              <IssueList
                title="Warnings (rows kept)"
                issues={preview.warnings}
                total={preview.warnings.length}
              />
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={startReplace} disabled={!usable || checking || uploading}>
              {checking && <LogoSpinner className="mr-2" />}
              Replace roster with this file
            </Button>
            <Button variant="ghost" onClick={clearFile} disabled={uploading}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !uploading && setConfirm(null)}
        title="Replace the parent roster?"
        description={
          preview && confirm
            ? `${plural(preview.parents.length, "parent", "parents")} will be active; ${plural(
                confirm.deactivated,
                "current parent",
                "current parents"
              )} not in this file will be deactivated.`
            : ""
        }
        confirmLabel="Replace roster"
        variant="default"
        loading={uploading}
        onConfirm={replace}
      />
    </div>
  );
}

function GateCard({
  schoolId,
  config,
  isSuperAdmin,
}: {
  schoolId: string;
  config: ParentSignInConfig;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config.requireRosterMatch);
  const [saving, setSaving] = useState(false);
  const emptyRoster = config.rosterActiveCount === 0;
  // School admins may turn the gate off, but only support can turn it on.
  const cannotEnable = !enabled && (!isSuperAdmin || emptyRoster);

  async function toggle(next: boolean) {
    setSaving(true);
    setEnabled(next);
    const result = await updateRequireRosterMatch(schoolId, next);
    setSaving(false);
    if (result.error) {
      setEnabled(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Roster match required" : "Roster match no longer required");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="require-roster-match">Require roster match for every sign-in</Label>
          <p className="text-xs text-muted-foreground">
            Parents must also be on this list, even when they sign in with
            Blackbaud or Veracross.
            {!enabled && !isSuperAdmin
              ? ` ${SUPPORT_NOTE}`
              : emptyRoster && !enabled
                ? " Upload a roster first."
                : ""}
          </p>
        </div>
        <Switch
          id="require-roster-match"
          checked={enabled}
          disabled={saving || cannotEnable}
          onCheckedChange={(next) => void toggle(next)}
        />
      </div>
    </div>
  );
}
