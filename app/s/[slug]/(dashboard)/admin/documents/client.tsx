"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Tags,
  Search,
  X,
  FileSearch,
  LayoutList,
  Network,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViewToggle } from "@/components/admin/view-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentUpload } from "@/components/admin/document-upload";
import { DocumentTable } from "@/components/admin/document-table";
import { DocumentEditDialog } from "@/components/admin/document-edit-dialog";
import { DocumentViewer } from "@/components/shared/document-viewer";
import { FolderTree } from "@/components/admin/folder-tree";
import { CategoryManager } from "@/components/admin/category-manager";
import {
  CategorySelectItems,
  useCategoryLabels,
} from "@/components/admin/category-select-items";
import { useSortDocuments } from "@/components/admin/use-sort-documents";
import { SortSummaryDialog } from "@/components/admin/sort-summary-dialog";
import { useSidebar } from "@/components/admin/sidebar-context";
import { Badge } from "@/components/ui/badge";
import { searchDocumentContent } from "@/actions/documents";
import { cn } from "@/lib/utils";
import type { MapView } from "@/lib/documents/sorting-map";
import type {
  Document,
  Category,
  Folder,
  ContentSearchResult,
  EventCalendar,
} from "@/lib/types";

// React Flow is heavy, so the map loads only when someone opens it.
const SortingMap = dynamic(
  () => import("@/components/admin/sorting-map").then((m) => m.SortingMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100dvh-13rem)] min-h-[508px] animate-pulse rounded-xl border border-border bg-muted/40" />
    ),
  }
);

interface DocumentsClientProps {
  documents: Document[];
  categories: Category[];
  folders: Folder[];
  divisions: EventCalendar[];
  schoolId: string;
  schoolSlug: string;
  autoSortEnabled: boolean;
}

export function DocumentsClient({
  documents,
  categories,
  folders,
  divisions,
  schoolId,
  schoolSlug,
  autoSortEnabled,
}: DocumentsClientProps) {
  // Map mode hides the list's filters, which keep their values, and puts the
  // map where the folder tree and table were.
  const [view, setView] = useState<"list" | "map">("list");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"title" | "content">("title");
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const categoryLabels = useCategoryLabels(categories, divisions);
  const {
    sorting,
    sort: sortDocuments,
    summary: sortSummary,
    dismissSummary,
  } = useSortDocuments(schoolId);
  // Ready documents with no category, which AI can sort on request.
  const unfiled = useMemo(
    () =>
      documents
        .filter((d) => !d.category_id && d.status === "ready")
        .map((d) => d.id),
    [documents]
  );
  const { setFolders } = useSidebar();

  // Sync folders to sidebar context so the sidebar can show them
  useEffect(() => {
    setFolders(folders);
  }, [folders, setFolders]);

  // Debounced content search
  const doContentSearch = useCallback(
    async (q: string) => {
      if (q.length < 3) {
        setContentResults([]);
        return;
      }
      setIsSearchingContent(true);
      const { results } = await searchDocumentContent(q, schoolId);
      setContentResults(results);
      setIsSearchingContent(false);
    },
    [schoolId]
  );

  useEffect(() => {
    if (searchMode !== "content") {
      setContentResults([]);
      return;
    }
    const timer = setTimeout(() => doContentSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, doContentSearch]);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || categoryFilter !== "all";

  // Collect all descendant folder IDs for a given folder
  const getDescendantIds = useCallback(
    (folderId: string): Set<string> => {
      const ids = new Set<string>([folderId]);
      const queue = [folderId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const f of folders) {
          if (f.parent_id === current && !ids.has(f.id)) {
            ids.add(f.id);
            queue.push(f.id);
          }
        }
      }
      return ids;
    },
    [folders]
  );

  const filteredDocs = useMemo(() => {
    let result = [...documents];

    if (selectedFolderId) {
      const folderIds = getDescendantIds(selectedFolderId);
      result = result.filter((d) => d.folder_id !== null && folderIds.has(d.folder_id));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }

    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter);
    }

    if (categoryFilter !== "all") {
      result = result.filter((d) => d.category_id === categoryFilter);
    }

    return result;
  }, [documents, selectedFolderId, searchQuery, statusFilter, categoryFilter]);

  // From a map card's menu: the list, filtered to just that card's documents.
  const showInList = useCallback((mapView: MapView, targetId: string) => {
    setSearchQuery("");
    setStatusFilter("all");
    setCategoryFilter(mapView === "category" ? targetId : "all");
    setSelectedFolderId(mapView === "folder" ? targetId : null);
    setView("list");
    // The menu that was focused goes away with the map; land on "List".
    requestAnimationFrame(() =>
      document.getElementById("documents-view-list")?.focus()
    );
  }, []);

  // Only ready documents can be viewed; the rest open for editing.
  const openFromMap = useCallback((doc: Document) => {
    if (doc.status === "ready") setViewingDoc(doc);
    else setEditingDoc(doc);
  }, []);

  const shownCount = view === "map" ? documents.length : filteredDocs.length;

  return (
    <div className="relative">
      <header className="relative mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
            Documents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-ink">{shownCount}</span>{" "}
            document{shownCount !== 1 ? "s" : ""}
            {view === "list" && selectedFolderId
              ? " in this folder"
              : " in your library"}
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ViewToggle
            label="Show documents as"
            value={view}
            onChange={setView}
            idPrefix="documents-view"
            options={[
              { value: "list", label: "List", icon: <LayoutList /> },
              { value: "map", label: "Map", icon: <Network /> },
            ]}
          />
          {categories.length > 0 && unfiled.length > 0 && (
            <Button
              variant="outline"
              onClick={() => sortDocuments(unfiled)}
              disabled={unfiled.every((id) => sorting.has(id))}
              title="File every document that has no category, using AI"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Sort {unfiled.length} unfiled
            </Button>
          )}
          <Button variant="outline" onClick={() => setCategoryOpen(true)}>
            <Tags className="mr-2 h-4 w-4" />
            Manage Categories
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Upload document
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "relative mb-4 flex flex-wrap items-center gap-3",
          view === "map" && "hidden"
        )}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              searchMode === "title"
                ? "Search by title..."
                : "Search document content..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-20"
          />
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs px-2"
            onClick={() =>
              setSearchMode((m) => (m === "title" ? "content" : "title"))
            }
          >
            <FileSearch className="mr-1 h-3 w-3" />
            {searchMode === "title" ? "Content" : "Title"}
          </Button>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Category">
              {categoryLabels.get(categoryFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <CategorySelectItems categories={categories} divisions={divisions} />
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setCategoryFilter("all");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Content search results */}
      {view === "list" && searchMode === "content" && searchQuery.length >= 3 && (
        <div className="relative mb-4">
          {isSearchingContent ? (
            <p className="text-sm text-ink-soft">Searching content...</p>
          ) : contentResults.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                {contentResults.length} content match{contentResults.length !== 1 && "es"}
              </p>
              {contentResults.map((r, i) => (
                <div
                  key={`${r.document_id}-${r.chunk_index}-${i}`}
                  className="cursor-pointer rounded-xl px-3 py-3 transition-colors hover:bg-muted/60"
                  onClick={() => {
                    const doc = documents.find((d) => d.id === r.document_id);
                    if (doc) setViewingDoc(doc);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{r.document_title}</p>
                    <Badge variant="secondary" className="text-xs">
                      Section {r.chunk_index + 1}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {r.snippet}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border p-8 text-center">
              <FileSearch className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
              <p className="text-lg font-semibold text-ink tracking-[-0.01em]">
                No content matches
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different phrase or search by title instead.
              </p>
            </div>
          )}
        </div>
      )}

      {view === "list" ? (
        <div className="relative flex gap-4">
          <div className="hidden md:block">
            <div className="rounded-xl border border-border p-3">
              <FolderTree
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                schoolId={schoolId}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-border">
            <DocumentTable
              documents={filteredDocs}
              onEdit={setEditingDoc}
              onView={setViewingDoc}
              onSort={(doc) => sortDocuments([doc.id])}
              sortingIds={sorting}
              categoryLabels={categoryLabels}
              schoolId={schoolId}
            />
          </div>
        </div>
      ) : (
        <SortingMap
          documents={documents}
          categories={categories}
          folders={folders}
          divisions={divisions}
          schoolId={schoolId}
          autoSortEnabled={autoSortEnabled}
          settingsHref={`/s/${schoolSlug}/admin/settings`}
          onOpenDocument={openFromMap}
          onEditDocument={setEditingDoc}
          onShowInList={showInList}
          sortingIds={sorting}
          onSortDocuments={sortDocuments}
        />
      )}

      <DocumentUpload
        categories={categories}
        divisions={divisions}
        folders={folders}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        selectedFolderId={selectedFolderId}
        schoolId={schoolId}
      />

      <SortSummaryDialog
        results={sortSummary}
        onClose={dismissSummary}
        onRetry={(ids) => {
          dismissSummary();
          sortDocuments(ids);
        }}
      />

      <CategoryManager
        categories={categories}
        divisions={divisions}
        documentCount={documents.length}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        schoolId={schoolId}
        onSetUp={sortDocuments}
      />

      {editingDoc && (
        <DocumentEditDialog
          document={editingDoc}
          categories={categories}
          folders={folders}
          divisions={divisions}
          open={!!editingDoc}
          onOpenChange={(open) => {
            if (!open) setEditingDoc(null);
          }}
          schoolId={schoolId}
        />
      )}

      <DocumentViewer
        document={viewingDoc}
        open={!!viewingDoc}
        onOpenChange={(open) => {
          if (!open) setViewingDoc(null);
        }}
      />
    </div>
  );
}
