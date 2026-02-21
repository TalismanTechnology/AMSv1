"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FileText,
  File,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  X,
  FolderOpen,
  FolderClosed,
  ChevronDown,
  ChevronRight,
  FileSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MagicBentoCard } from "@/components/magic-bento";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { DocumentViewer } from "@/components/shared/document-viewer";
import { searchDocumentContent } from "@/actions/documents";
import { formatDistanceToNow } from "date-fns";
import type { Document, Category, Folder, ContentSearchResult } from "@/lib/types";

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: File,
  doc: File,
  txt: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  pptx: File,
  image: ImageIcon,
};

interface FolderGroup {
  id: string;
  name: string;
  docs: Document[];
}

interface ParentDocumentsClientProps {
  documents: Document[];
  categories: Category[];
  folders: Folder[];
  schoolId: string;
}

export function ParentDocumentsClient({
  documents,
  categories,
  folders,
  schoolId,
}: ParentDocumentsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"title" | "content">("title");
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

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

  const hasActiveFilters = searchQuery || categoryFilter !== "all";

  const filteredDocs = useMemo(() => {
    let result = [...documents];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((d) => d.category_id === categoryFilter);
    }

    return result;
  }, [documents, searchQuery, categoryFilter]);

  const folderGroups = useMemo(() => {
    const folderMap = new Map<string, Document[]>();
    const ungrouped: Document[] = [];

    for (const doc of filteredDocs) {
      if (doc.folder_id) {
        const existing = folderMap.get(doc.folder_id) || [];
        existing.push(doc);
        folderMap.set(doc.folder_id, existing);
      } else {
        ungrouped.push(doc);
      }
    }

    const groups: FolderGroup[] = [];

    // Add folder groups in alphabetical order
    for (const folder of folders) {
      const docs = folderMap.get(folder.id);
      if (docs && docs.length > 0) {
        groups.push({ id: folder.id, name: folder.name, docs });
      }
    }

    // Add ungrouped documents last
    if (ungrouped.length > 0) {
      groups.push({ id: "_general", name: "General", docs: ungrouped });
    }

    return groups;
  }, [filteredDocs, folders]);

  function toggleFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Browse school documents and resources
        </p>
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
              setCategoryFilter("all");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
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

      {filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">
            No documents found
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting your search or filters."
              : "Check back later for school documents."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {folderGroups.map((group) => {
            const isOpen = expandedFolders.has(group.id);
            return (
              <Collapsible
                key={group.id}
                open={isOpen}
                onOpenChange={() => toggleFolder(group.id)}
              >
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  {isOpen ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <FolderClosed className="h-4 w-4 text-primary" />
                  )}
                  <span className="font-medium text-foreground">
                    {group.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[10px] tabular-nums"
                  >
                    {group.docs.length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {group.docs.map((doc) => {
                      const FileIcon =
                        FILE_TYPE_ICONS[doc.file_type] || FileText;
                      return (
                        <MagicBentoCard
                          key={doc.id}
                          enableBorderGlow
                          enableParticles={false}
                          className="rounded-xl"
                        >
                          <button
                            onClick={() => setViewingDoc(doc)}
                            className="w-full text-left rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50"
                          >
                            <div className="flex items-start gap-3">
                              <div className="rounded-lg bg-primary/10 p-2.5">
                                <FileIcon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-foreground truncate">
                                  {doc.title}
                                </h3>
                                {doc.description && (
                                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                    {doc.description}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] uppercase"
                                  >
                                    {doc.file_type}
                                  </Badge>
                                  {doc.category && (
                                    <Badge
                                      style={{
                                        backgroundColor:
                                          doc.category.color + "20",
                                        color: doc.category.color,
                                      }}
                                      className="text-[10px]"
                                    >
                                      {doc.category.name}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDistanceToNow(
                                      new Date(doc.created_at),
                                      { addSuffix: true }
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        </MagicBentoCard>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
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
