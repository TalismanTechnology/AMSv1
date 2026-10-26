"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderTree as FolderTreeIcon, Sparkles } from "lucide-react";
import { AutoFolderDialog } from "@/components/admin/auto-folder-dialog";
import { TOOLBAR_PILL as PILL } from "@/components/admin/toolbar-pill";
import { autoSortFolderCandidates } from "@/lib/documents/folders";
import type { Category, Document, Folder } from "@/lib/types";

const SORT_HELP =
  "Auto-sort: AI files documents that are missing a category or folder into the categories and folders you already have. It never creates folders.";
const FOLDER_HELP =
  "Auto-folder: AI proposes a new set of top-level folders (reusing yours where they fit) and where each document goes. You preview it before anything moves. Website and Responses are never touched.";

/**
 * The library's AI controls, shown above both the list and the map: the
 * auto-sort setting, "sort now", and Auto-folder.
 */
export function LibraryAiToolbar({
  documents,
  categories,
  folders,
  schoolId,
  autoSortEnabled,
  settingsHref,
  sortingIds,
  onSortDocuments,
}: {
  documents: Document[];
  categories: Category[];
  folders: Folder[];
  schoolId: string;
  autoSortEnabled: boolean;
  /** Where the auto-sort switch lives. */
  settingsHref: string;
  sortingIds: ReadonlySet<string>;
  onSortDocuments: (docIds: string[]) => void;
}) {
  const [autoFolderOpen, setAutoFolderOpen] = useState(false);

  // Ready documents auto-sort can do something for: no category (when there
  // are categories), or no folder (when there's a folder it could go in).
  const sortable = useMemo(() => {
    const hasFolderFor = new Map<string, boolean>();
    const canFolder = (source: string | undefined) => {
      const key = source ?? "upload";
      if (!hasFolderFor.has(key)) {
        hasFolderFor.set(key, autoSortFolderCandidates(folders, key).length > 0);
      }
      return hasFolderFor.get(key)!;
    };
    return documents
      .filter(
        (d) =>
          d.status === "ready" &&
          ((!d.category_id && categories.length > 0) ||
            (!d.folder_id && canFolder(d.source)))
      )
      .map((d) => d.id);
  }, [documents, categories.length, folders]);
  const pending = sortable.filter((id) => !sortingIds.has(id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={settingsHref}
        title={`${SORT_HELP} When on, new documents are auto-sorted as they arrive. Change this in Settings.`}
        className={PILL}
      >
        <Sparkles aria-hidden />
        Auto-sort {autoSortEnabled ? "on" : "off"}
      </Link>
      <button
        type="button"
        className={PILL}
        onClick={() => onSortDocuments(pending)}
        disabled={pending.length === 0}
        title={SORT_HELP}
      >
        <Sparkles aria-hidden />
        {sortable.length > 0 ? `Auto-sort ${sortable.length} now` : "Nothing to auto-sort"}
      </button>
      <button
        type="button"
        className={PILL}
        onClick={() => setAutoFolderOpen(true)}
        title={FOLDER_HELP}
      >
        <FolderTreeIcon aria-hidden />
        Auto-folder
      </button>

      <AutoFolderDialog
        open={autoFolderOpen}
        onOpenChange={setAutoFolderOpen}
        schoolId={schoolId}
        folders={folders}
      />
    </div>
  );
}
