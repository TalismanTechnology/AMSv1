"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Inbox,
  Library,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ViewToggle } from "@/components/admin/view-toggle";
import {
  applyAutoFolders,
  proposeAutoFolders,
  type AutoFolderPreview,
} from "@/actions/sorting";
import type { AutoFolderScope } from "@/lib/documents/auto-folder";
import type { Folder } from "@/lib/types";

/**
 * Auto-folder: the admin picks which documents, the AI proposes top-level
 * folders and where each document goes, and nothing changes until they
 * confirm the preview.
 */
export function AutoFolderDialog({
  open,
  onOpenChange,
  schoolId,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  folders: Folder[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<AutoFolderScope>("unfiled");
  const [preview, setPreview] = useState<AutoFolderPreview | null>(null);
  const [busy, setBusy] = useState<"proposing" | "applying" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folderNames = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders]
  );

  const reset = () => {
    setPreview(null);
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
      const result = await proposeAutoFolders(schoolId, scope);
      if (result.error) setError(result.error);
      else setPreview(result.preview ?? null);
    } catch {
      setError("The request didn't go through. Check your connection and try again.");
    }
    setBusy(null);
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("applying");
    try {
      const result = await applyAutoFolders(
        schoolId,
        preview.scope,
        preview.moves.map((m) => ({ documentId: m.documentId, folder: m.folder }))
      );
      if (result.error) {
        setError(result.error);
        setBusy(null);
        return;
      }
      const created = result.created?.length ?? 0;
      const moved = result.moved ?? 0;
      const parts = [
        `Moved ${moved} document${moved === 1 ? "" : "s"}`,
        created ? `created ${created} folder${created === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      toast.success(parts.join(", "), {
        description: result.skipped
          ? `${result.skipped} left as they were (changed since the preview, or not allowed).`
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

  const newFolders = preview?.folders.filter((f) => !f.existingId) ?? [];
  const reused = preview?.folders.filter((f) => f.existingId) ?? [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            Auto-folder
          </DialogTitle>
          <DialogDescription>
            AI proposes a set of top-level folders, reusing the ones you have
            where they fit, and where each document goes. You review it first;
            nothing moves until you apply. Website and Responses are never
            touched, and no folder or document is deleted.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Which documents?</p>
              <ViewToggle
                label="Documents to organise"
                value={scope}
                onChange={setScope}
                options={[
                  { value: "unfiled", label: "Unfiled only", icon: <Inbox /> },
                  {
                    value: "all",
                    label: "All except Website/Responses",
                    icon: <Library />,
                  },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {scope === "unfiled"
                  ? "Only documents that aren't in a folder yet."
                  : "Also re-files documents already in folders, except anything in Website or Responses."}
              </p>
            </div>
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
                : "There's nothing to organise in this selection."}
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
              Move <span className="font-medium">{preview.moves.length}</span>{" "}
              document{preview.moves.length === 1 ? "" : "s"} into{" "}
              {preview.folders.length} folder{preview.folders.length === 1 ? "" : "s"}
              {newFolders.length > 0 && (
                <>
                  , creating <span className="font-medium">{newFolders.length}</span>{" "}
                  new
                </>
              )}
              .
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
              <p className="text-sm font-medium text-ink">Where documents go</p>
              {[...newFolders, ...reused].map((target) => {
                const docs = preview.moves.filter((m) => m.folder === target.name);
                return (
                  <details key={target.name} className="group rounded-lg px-2 py-1 hover:bg-muted/40">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-ink">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                      <FolderIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{target.name}</span>
                      {!target.existingId && (
                        <span className="text-xs text-muted-foreground">(new)</span>
                      )}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {docs.length}
                      </span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pb-1 pl-11 text-sm text-ink-soft">
                      {docs.map((m) => (
                        <li key={m.documentId} className="truncate" title={m.title}>
                          {m.title}
                          {m.fromFolderId && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · from {folderNames.get(m.fromFolderId) ?? "another folder"}
                            </span>
                          )}
                        </li>
                      ))}
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
                  `${preview.remaining} more document${preview.remaining === 1 ? "" : "s"} weren't looked at this time; run Auto-folder again afterwards.`}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={reset} disabled={!!busy}>
                Back
              </Button>
              <Button onClick={apply} disabled={!!busy}>
                {busy === "applying" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy === "applying"
                  ? "Applying…"
                  : `Apply: move ${preview.moves.length}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
