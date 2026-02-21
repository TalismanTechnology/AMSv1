"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Tags, Search, X, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useSidebar } from "@/components/admin/sidebar-context";
import { MagicBentoCard } from "@/components/magic-bento";
import { Badge } from "@/components/ui/badge";
import { searchDocumentContent } from "@/actions/documents";
import type { Document, Category, Folder, ContentSearchResult } from "@/lib/types";

interface DocumentsClientProps {
  documents: Document[];
  categories: Category[];
  folders: Folder[];
  schoolId: string;
  schoolSlug: string;
}

export function DocumentsClient({
  documents,
  categories,
  folders,
  schoolId,
  schoolSlug,
}: DocumentsClientProps) {
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

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
            {selectedFolderId ? " in this folder" : " total"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryOpen(true)}>
            <Tags className="mr-2 h-4 w-4" />
            Manage Labels
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Upload document
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
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
      {searchMode === "content" && searchQuery.length >= 3 && (
        <div className="mb-4">
          {isSearchingContent ? (
            <p className="text-sm text-muted-foreground">Searching content...</p>
          ) : contentResults.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {contentResults.length} content match{contentResults.length !== 1 && "es"}
              </p>
              {contentResults.map((r, i) => (
                <div
                  key={`${r.document_id}-${r.chunk_index}-${i}`}
                  className="cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
                  onClick={() => {
                    const doc = documents.find((d) => d.id === r.document_id);
                    if (doc) setViewingDoc(doc);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{r.document_title}</p>
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
            <p className="text-sm text-muted-foreground">No content matches found.</p>
          )}
        </div>
      )}

      <div className="flex gap-4">
        <div className="hidden md:block">
          <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
            <FolderTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              schoolId={schoolId}
            />
          </MagicBentoCard>
        </div>
        <MagicBentoCard enableBorderGlow enableParticles={false} className="flex-1 min-w-0 rounded-lg">
          <DocumentTable
            documents={filteredDocs}
            onEdit={setEditingDoc}
            onView={setViewingDoc}
            schoolId={schoolId}
          />
        </MagicBentoCard>
      </div>

      <DocumentUpload
        categories={categories}
        folders={folders}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        selectedFolderId={selectedFolderId}
        schoolId={schoolId}
      />

      <CategoryManager
        categories={categories}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        schoolId={schoolId}
      />

      {editingDoc && (
        <DocumentEditDialog
          document={editingDoc}
          categories={categories}
          folders={folders}
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
