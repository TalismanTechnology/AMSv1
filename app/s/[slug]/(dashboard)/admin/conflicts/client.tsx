"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  FileText,
  Globe,
  PenLine,
  RotateCcw,
  ScanSearch,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  dismissConflict,
  reopenConflict,
  resolveConflict,
  scanConflicts,
  type ConflictRuling,
} from "@/actions/conflicts";
import type { HighlightedExcerpt } from "@/lib/conflicts/quotes";
import { isRunActive, type ScanRunSummary } from "@/lib/conflicts/runs";
import { cn } from "@/lib/utils";
import { stripMarkdown } from "@/lib/markdown/normalize";

const DocumentViewer = dynamic(
  () => import("@/components/shared/document-viewer").then((m) => m.DocumentViewer),
  { ssr: false }
);

export interface ConflictSideView {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  source: string | null;
  sourceUrl: string | null;
  page: number | null;
  location: string | null;
  statement: string | null;
  excerpt: HighlightedExcerpt;
}

export interface ConflictView {
  id: string;
  status: "open" | "resolved" | "dismissed" | "auto_dismissed";
  resolution: ConflictRuling | null;
  adminNote: string | null;
  topic: string | null;
  description: string | null;
  confidence: number | null;
  createdAt: string;
  resolvedAt: string | null;
  a: ConflictSideView;
  b: ConflictSideView;
}

export interface ConflictsPageData {
  /** Migration 046 is applied. */
  installed: boolean;
  open: ConflictView[];
  reviewed: ConflictView[];
  lastRun: ScanRunSummary | null;
  loadError: string | null;
}

type Tab = "open" | "reviewed";
const POLL_MS = 5000;

export function ConflictsClient({ schoolId, data }: { schoolId: string; data: ConflictsPageData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [starting, setStarting] = useState(false);
  const [viewing, setViewing] = useState<ConflictSideView | null>(null);
  const scanning = starting || isRunActive(data.lastRun);

  // Follow a scan running in the background until its run row finishes.
  useEffect(() => {
    if (!isRunActive(data.lastRun)) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [data.lastRun, router]);

  async function handleScan() {
    setStarting(true);
    const result = await scanConflicts(schoolId);
    setStarting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Scanning your documents for conflicts…");
    router.refresh();
  }

  const list = tab === "open" ? data.open : data.reviewed;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Conflicts</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Places where two of your documents disagree — a different time, deadline or contact
            for the same thing. Pick which one is right (or write the correct answer) and the
            assistant will use your answer from then on. Your documents are never changed.
          </p>
          {data.installed && <LastScan run={data.lastRun} />}
        </div>
        <Button
          onClick={handleScan}
          disabled={!data.installed || scanning}
          className="bg-primary text-primary-foreground"
        >
          {scanning ? <LogoSpinner className="mr-2" /> : <ScanSearch className="mr-2 h-4 w-4" />}
          {scanning ? "Scanning…" : "Scan for conflicts"}
        </Button>
      </div>

      {!data.installed ? (
        <p className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm text-amber-600">
          Conflict detection needs a database update before it can be used. Ask AskMySchool
          support to apply migration 046_document_conflicts.sql.
        </p>
      ) : (
        <>
          {data.loadError && (
            <p className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm text-amber-600">
              {data.loadError}
            </p>
          )}

          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
            {(
              [
                ["open", `Open (${data.open.length})`],
                ["reviewed", `Reviewed (${data.reviewed.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={tab === value}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  tab === value
                    ? "bg-secondary font-medium text-ink"
                    : "text-muted-foreground hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {tab === "open"
                ? data.lastRun
                  ? "No open conflicts. New documents are checked every day."
                  : "No conflicts found yet. Run a scan to check your documents."
                : "Nothing reviewed yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {list.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  schoolId={schoolId}
                  conflict={conflict}
                  onView={setViewing}
                />
              ))}
            </div>
          )}
        </>
      )}

      <DocumentViewer
        document={
          viewing
            ? {
                id: viewing.documentId,
                title: viewing.title,
                file_type: viewing.fileType,
                file_name: viewing.fileName,
                file_url: viewing.fileUrl,
                source: viewing.source,
                source_url: viewing.sourceUrl,
              }
            : null
        }
        page={viewing?.page ?? undefined}
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      />
    </div>
  );
}

function LastScan({ run }: { run: ScanRunSummary | null }) {
  if (!run) return <p className="text-xs text-muted-foreground">Never scanned.</p>;
  if (isRunActive(run)) {
    return (
      <p className="text-xs text-muted-foreground">
        Scan started <TimeAgo date={run.started_at} />…
      </p>
    );
  }
  const failed = run.status !== "completed";
  return (
    <p className={cn("text-xs", failed ? "text-amber-600" : "text-muted-foreground")}>
      Last scanned <TimeAgo date={run.finished_at ?? run.started_at} />
      {failed
        ? " — the scan didn't finish."
        : ` · ${run.pairs_judged} similar passage${run.pairs_judged === 1 ? "" : "s"} checked, ${run.conflicts_found} conflict${run.conflicts_found === 1 ? "" : "s"} found`}
      {!failed && run.error ? ` · ${run.error}` : ""}
    </p>
  );
}

function ConflictCard({
  schoolId,
  conflict,
  onView,
}: {
  schoolId: string;
  conflict: ConflictView;
  onView: (side: ConflictSideView) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ConflictRuling | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isOpen = conflict.status === "open";

  async function run(action: () => Promise<{ error?: string }>, done: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(done);
    setMode(null);
    setNote("");
    router.refresh();
  }

  const submitRuling = () => {
    if (!mode) return;
    if (mode === "custom" && !note.trim()) {
      toast.error("Write the correct answer first.");
      return;
    }
    run(() => resolveConflict(schoolId, conflict.id, mode, note), "Saved. The assistant will use your answer.");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-ink">{stripMarkdown(conflict.topic, { singleLine: true }) || "Conflicting documents"}</p>
          {conflict.description && (
            <p className="text-sm text-ink-soft">{stripMarkdown(conflict.description)}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!isOpen && <StatusPill conflict={conflict} />}
          {conflict.confidence != null && (
            <span
              className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-soft"
              title="How sure the AI is that these disagree"
            >
              {Math.round(conflict.confidence * 100)}% sure
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SideCard
          label="Document A"
          side={conflict.a}
          chosen={conflict.resolution === "a_correct"}
          onView={onView}
        />
        <SideCard
          label="Document B"
          side={conflict.b}
          chosen={conflict.resolution === "b_correct"}
          onView={onView}
        />
      </div>

      {!isOpen && conflict.adminNote && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-ink">
          <p className="text-xs font-medium text-muted-foreground">
            {conflict.resolution === "custom" ? "Your answer" : "Your note"}
          </p>
          <p className="whitespace-pre-wrap break-words">{conflict.adminNote}</p>
        </div>
      )}

      {isOpen && mode && (
        <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm text-ink">
            {mode === "custom"
              ? "Write the correct answer. Parents asking about this will be given it, labelled as a school clarification."
              : `Parents will be given ${mode === "a_correct" ? "Document A" : "Document B"}'s version. You can add a note for them too.`}
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={
              mode === "custom"
                ? "e.g. Carpool pickup starts at 3:15 PM for all divisions this year."
                : "Optional note"
            }
            aria-label={mode === "custom" ? "Correct answer" : "Optional note"}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={submitRuling}
              disabled={busy || (mode === "custom" && !note.trim())}
              className="bg-primary text-primary-foreground"
            >
              {busy ? <LogoSpinner className="mr-2" /> : <Check className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isOpen ? (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("a_correct")}>
              <Check className="mr-2 h-4 w-4" />
              Document A is correct
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("b_correct")}>
              <Check className="mr-2 h-4 w-4" />
              Document B is correct
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("custom")}>
              <PenLine className="mr-2 h-4 w-4" />
              Write the correct answer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              className="text-muted-foreground"
              onClick={() =>
                run(() => dismissConflict(schoolId, conflict.id), "Marked as not a conflict.")
              }
            >
              <X className="mr-2 h-4 w-4" />
              Not a conflict
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => reopenConflict(schoolId, conflict.id), "Reopened.")}
          >
            {busy ? <LogoSpinner className="mr-2" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ conflict }: { conflict: ConflictView }) {
  const label =
    conflict.status === "dismissed"
      ? "Not a conflict"
      : conflict.resolution === "a_correct"
        ? "A is correct"
        : conflict.resolution === "b_correct"
          ? "B is correct"
          : "Answer written";
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-ink-soft">
      {label}
      {conflict.resolvedAt && (
        <>
          {" · "}
          <TimeAgo date={conflict.resolvedAt} />
        </>
      )}
    </span>
  );
}

function SideCard({
  label,
  side,
  chosen,
  onView,
}: {
  label: string;
  side: ConflictSideView;
  chosen: boolean;
  onView: (side: ConflictSideView) => void;
}) {
  const isWebsite = side.source === "website" || !!side.sourceUrl;
  const { excerpt } = side;
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border p-3",
        chosen ? "border-primary/50 bg-primary/5" : "border-border bg-background"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
            {chosen && <span className="ml-1.5 normal-case text-primary">· chosen</span>}
          </p>
          {isWebsite && side.sourceUrl ? (
            <a
              href={side.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-ink hover:underline"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{side.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onView(side)}
              className="flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-ink hover:underline"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{side.title}</span>
            </button>
          )}
          {side.location && <p className="text-xs text-muted-foreground">{side.location}</p>}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-soft">
        {excerpt.clippedStart && "… "}
        {excerpt.before}
        {excerpt.match && (
          <mark className="rounded bg-amber-200/70 px-0.5 text-ink dark:bg-amber-400/30">
            {excerpt.match}
          </mark>
        )}
        {excerpt.after}
        {excerpt.clippedEnd && " …"}
      </p>
      {!excerpt.match && side.statement && (
        <p className="mt-2 text-xs text-ink">
          <span className="text-muted-foreground">Says: </span>“{side.statement}”
        </p>
      )}
    </div>
  );
}
