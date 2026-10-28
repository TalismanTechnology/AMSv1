"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder as FolderIcon, FolderInput, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyContactAiSort,
  proposeContactAiSort,
  type ContactAiSortPreview,
} from "@/actions/contact-folders";
import type { ContactFolder } from "@/lib/contacts/folders";

/**
 * AI sort for contacts: the AI proposes folders (reusing the school's where
 * they fit) and where each contact goes; the admin unticks anything they
 * don't want and nothing moves until they apply.
 */
export function ContactAiSortDialog({
  open,
  onOpenChange,
  schoolId,
  folders,
  initialPreview = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  folders: ContactFolder[];
  /** Start on the preview step (used to render the dialog with fixture data). */
  initialPreview?: ContactAiSortPreview | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<ContactAiSortPreview | null>(initialPreview);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"proposing" | "applying" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const reset = () => {
    setPreview(null);
    setExcluded(new Set());
    setError(null);
    setBusy(null);
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const propose = async () => {
    setBusy("proposing");
    setError(null);
    try {
      const result = await proposeContactAiSort(schoolId);
      if (result.error) setError(result.error);
      else {
        setPreview(result.preview ?? null);
        setExcluded(new Set());
      }
    } catch {
      setError("The request didn't go through. Check your connection and try again.");
    }
    setBusy(null);
  };

  const included = preview?.moves.filter((m) => !excluded.has(m.contactId)) ?? [];

  const apply = async () => {
    if (!included.length) return;
    setBusy("applying");
    try {
      const result = await applyContactAiSort(
        schoolId,
        included.map((m) => ({ contactId: m.contactId, folder: m.folder }))
      );
      if (result.error) {
        setError(result.error);
        setBusy(null);
        return;
      }
      const created = result.created?.length ?? 0;
      const moved = result.moved ?? 0;
      const parts = [
        `Moved ${moved} contact${moved === 1 ? "" : "s"}`,
        created ? `created ${created} folder${created === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      toast.success(parts.join(", "), {
        description: result.skipped
          ? `${result.skipped} left as they were (changed since the preview).`
          : undefined,
      });
      router.refresh();
      reset();
      onOpenChange(false);
    } catch {
      setError("The request didn't go through. Check your connection and try again.");
      setBusy(null);
    }
  };

  const toggle = (ids: string[], on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const newFolders = preview?.folders.filter((f) => !f.existingId) ?? [];
  const reused = preview?.folders.filter((f) => f.existingId) ?? [];
  const targetCount = new Set(included.map((m) => m.folder)).size;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            AI sort
          </DialogTitle>
          <DialogDescription>
            AI proposes folders for your contacts, reusing the ones you have
            where they fit, and where each contact goes. You review it first;
            nothing moves until you apply. Only names, roles, topics and
            divisions are sent to the AI, and no contact is approved, changed
            or deleted.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => close(false)} disabled={!!busy}>
                Cancel
              </Button>
              <Button onClick={propose} disabled={!!busy}>
                {busy === "proposing" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderInput className="mr-2 h-4 w-4" />
                )}
                {busy === "proposing" ? "Thinking…" : "Propose folders"}
              </Button>
            </div>
          </div>
        ) : preview.moves.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {preview.skipped.length
                ? "The AI's suggestions would leave everything where it is."
                : "There are no contacts to sort."}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Move <span className="font-medium">{included.length}</span> contact
              {included.length === 1 ? "" : "s"} into {targetCount} folder
              {targetCount === 1 ? "" : "s"}
              {newFolders.length > 0 && (
                <>
                  , creating up to <span className="font-medium">{newFolders.length}</span> new
                </>
              )}
              . Untick anyone who should stay where they are.
            </p>

            {newFolders.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  New folders
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5 pl-6">
                  {newFolders.map((f) => (
                    <li
                      key={f.name}
                      className="rounded-full border border-border px-2.5 py-0.5 text-xs text-ink-soft"
                    >
                      {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">Where contacts go</p>
              {[...newFolders, ...reused].map((target) => {
                const moves = preview.moves.filter((m) => m.folder === target.name);
                const ids = moves.map((m) => m.contactId);
                const kept = ids.filter((id) => !excluded.has(id)).length;
                return (
                  <details key={target.name} open className="group rounded-lg px-2 py-1 hover:bg-muted/40">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-ink">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                      <Checkbox
                        aria-label={`Include everyone going to ${target.name}`}
                        checked={kept === ids.length ? true : kept === 0 ? false : "indeterminate"}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) => toggle(ids, v !== false)}
                      />
                      <FolderIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{target.name}</span>
                      {!target.existingId && (
                        <span className="text-xs text-muted-foreground">(new)</span>
                      )}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {kept}/{ids.length}
                      </span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pb-1 pl-6 text-sm text-ink-soft">
                      {moves.map((m) => {
                        const on = !excluded.has(m.contactId);
                        return (
                          <li key={m.contactId}>
                            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
                              <Checkbox
                                checked={on}
                                onCheckedChange={(v) => toggle([m.contactId], v === true)}
                              />
                              <span className={on ? "truncate" : "truncate line-through opacity-60"}>
                                {m.label}
                              </span>
                              {m.fromFolderId && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  · from {folderNames.get(m.fromFolderId) ?? "another folder"}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>

            {(preview.remaining > 0 || preview.skipped.length > 0) && (
              <p className="text-xs text-muted-foreground">
                {preview.skipped.length > 0 &&
                  `${preview.skipped.length} suggestion${preview.skipped.length === 1 ? " was" : "s were"} left out (already there, or not allowed). `}
                {preview.remaining > 0 &&
                  `${preview.remaining} more contact${preview.remaining === 1 ? "" : "s"} weren't looked at this time; run AI sort again afterwards.`}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={reset} disabled={!!busy}>
                Back
              </Button>
              <Button onClick={apply} disabled={!!busy || included.length === 0}>
                {busy === "applying" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy === "applying" ? "Applying…" : `Apply: move ${included.length}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
