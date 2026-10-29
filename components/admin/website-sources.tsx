"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createWebsiteSource,
  deleteWebsiteSource,
  syncWebsiteSourceNow,
  updateWebsiteSource,
  type WebsiteSourceInput,
} from "@/actions/website-sources";
import { parsePatternList } from "@/lib/website/url";

export interface WebsiteSourceView {
  id: string;
  rootUrl: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxPages: number;
  enabled: boolean;
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  pageCount: number;
  /** Set while a sync is running: URLs handled vs queued so far this run. */
  progress: { processed: number; total: number } | null;
}

const STATUS_PRESENTATION: Record<string, { label: string; dot: string }> = {
  running: { label: "Syncing", dot: "bg-sky-500 animate-pulse" },
  success: { label: "Up to date", dot: "bg-emerald-500" },
  partial: { label: "Partly synced", dot: "bg-amber-500" },
  error: { label: "Sync failed", dot: "bg-red-500" },
  cancelled: { label: "Sync cancelled", dot: "bg-muted-foreground" },
};

// While anything is syncing, refresh the server data this often.
const POLL_MS = 10_000;

export function WebsiteSources({
  schoolId,
  sources,
  loadError,
}: {
  schoolId: string;
  sources: WebsiteSourceView[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<WebsiteSourceView | "new" | null>(null);
  const [deleting, setDeleting] = useState<WebsiteSourceView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const anyRunning = sources.some((s) => s.lastSyncStatus === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, router]);

  async function handleSync(source: WebsiteSourceView) {
    setSyncingId(source.id);
    const result = await syncWebsiteSourceNow(schoolId, source.id);
    setSyncingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.alreadyRunning
        ? "A sync is already running — it will keep going."
        : "Sync started. Pages appear in Documents as they're processed."
    );
    router.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const result = await deleteWebsiteSource(schoolId, deleting.id);
    setDeleteBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Website removed, along with its documents");
    setDeleting(null);
    router.refresh();
  }

  return (
    <section id="setting-website-sources" className="scroll-mt-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">Website sources</h2>
          <p className="text-sm text-muted-foreground">
            Your public website is crawled daily and its pages (and PDFs) are
            added to what the assistant can answer from. Answers link back to
            the page they came from.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing("new")} disabled={!!loadError}>
          <Plus className="mr-2 h-4 w-4" />
          Add website
        </Button>
      </div>

      {loadError && (
        <p className="rounded-lg border border-red-500/40 bg-card p-4 text-sm text-red-500">
          {loadError}
        </p>
      )}

      {!loadError && sources.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No websites yet. Add your school&apos;s homepage to get started.
        </p>
      )}

      <div className="space-y-3">
        {sources.map((source) => {
          const running = source.lastSyncStatus === "running";
          const presentation = !source.enabled
            ? { label: "Off", dot: "bg-muted-foreground/50" }
            : source.lastSyncStatus
              ? STATUS_PRESENTATION[source.lastSyncStatus] ?? {
                  label: source.lastSyncStatus,
                  dot: "bg-muted-foreground",
                }
              : { label: "Not synced yet", dot: "bg-muted-foreground/50" };

          return (
            <div key={source.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <a
                    href={source.rootUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 truncate text-sm font-medium text-ink hover:underline"
                  >
                    {source.rootUrl}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${presentation.dot}`} />
                    <span className="text-xs text-ink-soft">
                      {presentation.label}
                      {running && source.progress && source.progress.total > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {source.progress.processed.toLocaleString()} of{" "}
                          {source.progress.total.toLocaleString()} URLs checked
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums text-ink tracking-[-0.02em]">
                    {source.pageCount.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.pageCount === 1 ? "page indexed" : "pages indexed"}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {running ? "Started" : "Last synced"}
                  </dt>
                  <dd className="text-ink-soft">
                    {running && source.lastSyncStartedAt ? (
                      <TimeAgo date={source.lastSyncStartedAt} />
                    ) : source.lastSyncFinishedAt ? (
                      <TimeAgo date={source.lastSyncFinishedAt} />
                    ) : (
                      "Never"
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Page limit</dt>
                  <dd className="text-ink-soft tabular-nums">{source.maxPages.toLocaleString()}</dd>
                </div>
                {(source.includePatterns.length > 0 || source.excludePatterns.length > 0) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Patterns</dt>
                    <dd className="text-right text-ink-soft">
                      {source.includePatterns.length > 0 &&
                        `${source.includePatterns.length} included`}
                      {source.includePatterns.length > 0 && source.excludePatterns.length > 0 && " · "}
                      {source.excludePatterns.length > 0 &&
                        `${source.excludePatterns.length} excluded`}
                    </dd>
                  </div>
                )}
                {source.lastSyncError && !running && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Last error</dt>
                    <dd className="break-words text-right text-red-500">{source.lastSyncError}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSync(source)}
                  disabled={!source.enabled || syncingId === source.id}
                >
                  {syncingId === source.id || running ? (
                    <LogoSpinner className="mr-2" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {running ? "Syncing…" : "Sync now"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(source)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => setDeleting(source)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        The crawler stays on your site, follows robots.txt, and skips sign-in
        pages, portals, search results, calendar exports and archives. Pages
        that disappear are removed after two syncs (immediately if they return
        &quot;not found&quot;).
      </p>

      {editing && (
        <WebsiteSourceDialog
          schoolId={schoolId}
          source={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this website?"
        description={`Every document synced from ${deleting?.rootUrl ?? "this website"} will be deleted too, and the assistant will stop answering from it.`}
        confirmLabel="Delete website"
        loading={deleteBusy}
        onConfirm={handleDelete}
      />
    </section>
  );
}

function WebsiteSourceDialog({
  schoolId,
  source,
  onClose,
  onSaved,
}: {
  schoolId: string;
  source: WebsiteSourceView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rootUrl, setRootUrl] = useState(source?.rootUrl ?? "");
  const [include, setInclude] = useState((source?.includePatterns ?? []).join("\n"));
  const [exclude, setExclude] = useState((source?.excludePatterns ?? []).join("\n"));
  const [maxPages, setMaxPages] = useState(String(source?.maxPages ?? 300));
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    const input: WebsiteSourceInput = {
      rootUrl,
      includePatterns: parsePatternList(include),
      excludePatterns: parsePatternList(exclude),
      maxPages: Number(maxPages),
      enabled,
    };
    const result = source
      ? await updateWebsiteSource(schoolId, source.id, input)
      : await createWebsiteSource(schoolId, input);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      source ? "Website updated" : "Website added. Use Sync now to crawl it right away."
    );
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            {source ? "Edit website" : "Add website"}
          </DialogTitle>
          <DialogDescription>
            Pages are crawled from this address and kept up to date daily.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="website-root" className="text-ink-soft">
              Website address
            </Label>
            <Input
              id="website-root"
              value={rootUrl}
              onChange={(e) => setRootUrl(e.target.value)}
              placeholder="https://www.yourschool.org"
              inputMode="url"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website-include" className="text-ink-soft">
              Only include (optional)
            </Label>
            <Textarea
              id="website-include"
              value={include}
              onChange={(e) => setInclude(e.target.value)}
              rows={3}
              placeholder={"/admissions\n/about\n*/handbook*"}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              One path per line. A path matches everything under it; use * as a
              wildcard. Leave empty to include the whole site.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website-exclude" className="text-ink-soft">
              Exclude (optional)
            </Label>
            <Textarea
              id="website-exclude"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              rows={3}
              placeholder={"/news/archive\n/alumni"}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <Label htmlFor="website-max-pages" className="text-ink-soft">
                Max pages
              </Label>
              <Input
                id="website-max-pages"
                type="number"
                min={1}
                max={2000}
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex items-center gap-3 pb-2">
              <Label htmlFor="website-enabled" className="text-ink-soft">
                Sync daily
              </Label>
              <Switch id="website-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!rootUrl.trim() || saving}
              className="bg-primary text-primary-foreground"
            >
              {saving && <LogoSpinner className="mr-2" />}
              {source ? "Save changes" : "Add website"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
