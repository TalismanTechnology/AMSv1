"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Trash2,
  Pencil,
  MoreHorizontal,
  CheckCircle,
  Eye,
  Mail,
  Sparkles,
} from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  deleteDocument,
  bulkDeleteDocuments,
  approveDocument,
} from "@/actions/documents";
import { toast } from "sonner";
import type { Document, EventCalendar } from "@/lib/types";
import { TimeAgo } from "@/components/ui/time-ago";
import { calendarColorClasses } from "@/lib/event-calendars";

function EmailedBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-xs" title="Added from an email">
      <Mail />
      Emailed
    </Badge>
  );
}

function DivisionBadge({ division }: { division: EventCalendar }) {
  return (
    <Badge
      className={`text-xs ${calendarColorClasses(division.color).chip}`}
      title={`For ${division.name}`}
    >
      {division.name}
    </Badge>
  );
}

function DocumentSummary({ summary }: { summary: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  // Only offer "Show more" when the clamp is actually hiding text
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, summary]);

  return (
    <div className="mt-0.5 max-w-sm">
      <p
        ref={ref}
        className={`whitespace-normal text-xs text-muted-foreground/80 ${expanded ? "" : "line-clamp-2"}`}
      >
        {summary}
      </p>
      {(truncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-ink"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

interface DocumentTableProps {
  documents: Document[];
  onEdit?: (doc: Document) => void;
  onView?: (doc: Document) => void;
  /** File an unfiled document with AI right away. */
  onSort?: (doc: Document) => void;
  sortingIds?: ReadonlySet<string>;
  /** Category names with their division, e.g. "Upper School · Academics". */
  categoryLabels?: Map<string, string>;
  schoolId: string;
}

export function DocumentTable({
  documents,
  onEdit,
  onView,
  onSort,
  sortingIds,
  categoryLabels,
  schoolId,
}: DocumentTableProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteDocument(deleteId, schoolId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Document deleted");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteId);
        return next;
      });
    }
    setDeleting(false);
    setDeleteId(null);
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const result = await bulkDeleteDocuments([...selected], schoolId);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`${selected.size} documents deleted`);
      setSelected(new Set());
    }
    setBulkDeleting(false);
    setShowBulkDelete(false);
  }

  async function handleApprove(id: string) {
    const result = await approveDocument(id, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("Document approved");
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map((d) => d.id)));
    }
  }

  // Auto-refresh when any document is processing
  const hasProcessing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, router]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <Badge variant="default" className="bg-success/15 text-success">
            Ready
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-amber-500/15 text-amber-500">
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="gap-1">
            <LogoSpinner size={12} />
            Processing
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="mb-4 h-6 w-6 text-muted-foreground" />
        <h3 className="text-xl font-semibold tracking-[-0.01em] text-ink">
          No documents yet
        </h3>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          Upload your first document to start building your school&apos;s knowledge base.
        </p>
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-border px-4 py-2.5">
          <span className="text-sm font-medium text-ink">
            {selected.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowBulkDelete(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <div>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    selected.size === documents.length && documents.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground">
                Title
              </TableHead>
              <TableHead className="hidden text-xs font-normal text-muted-foreground md:table-cell">
                Type
              </TableHead>
              <TableHead className="hidden text-xs font-normal text-muted-foreground md:table-cell">
                Category
              </TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="hidden text-xs font-normal text-muted-foreground md:table-cell">
                Uploaded
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow
                key={doc.id}
                data-state={selected.has(doc.id) ? "selected" : undefined}
                className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggleSelect(doc.id)}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <div>
                    <p className="font-medium text-ink">{doc.title}</p>
                    {doc.summary && <DocumentSummary summary={doc.summary} />}
                    {doc.divisions && doc.divisions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {doc.divisions.map((division) => (
                          <DivisionBadge key={division.id} division={division} />
                        ))}
                      </div>
                    )}
                    {doc.tags.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {doc.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 flex gap-1 md:hidden">
                      <Badge variant="secondary" className="text-xs uppercase">
                        {doc.file_type}
                      </Badge>
                      {doc.source === "email" && <EmailedBadge />}
                      {doc.category && (
                        <Badge
                          style={{
                            backgroundColor: doc.category.color + "20",
                            color: doc.category.color,
                          }}
                        >
                          {categoryLabels?.get(doc.category.id) ?? doc.category.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs uppercase">
                      {doc.file_type}
                    </Badge>
                    {doc.source === "email" && <EmailedBadge />}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {doc.category ? (
                    <Badge
                      style={{
                        backgroundColor: doc.category.color + "20",
                        color: doc.category.color,
                      }}
                    >
                      {categoryLabels?.get(doc.category.id) ?? doc.category.name}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground/70">
                      &mdash;
                    </span>
                  )}
                </TableCell>
                <TableCell>{statusBadge(doc.status)}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  <TimeAgo date={doc.created_at} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onView && doc.status === "ready" && (
                        <DropdownMenuItem onClick={() => onView(doc)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                      )}
                      {doc.status === "pending" && (
                        <DropdownMenuItem onClick={() => handleApprove(doc.id)}>
                          <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                          Approve
                        </DropdownMenuItem>
                      )}
                      {onSort && !doc.category_id && doc.status === "ready" && (
                        <DropdownMenuItem
                          disabled={sortingIds?.has(doc.id)}
                          onClick={() => onSort(doc)}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {sortingIds?.has(doc.id) ? "Sorting…" : "Sort with AI"}
                        </DropdownMenuItem>
                      )}
                      {onEdit && (
                        <DropdownMenuItem onClick={() => onEdit(doc)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(doc.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete document"
        description="Are you sure you want to delete this document? All associated chunks and embeddings will also be removed."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        title={`Delete ${selected.size} documents`}
        description="Are you sure you want to delete the selected documents? All associated data will be removed."
        confirmLabel="Delete all"
        variant="destructive"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
      />
    </>
  );
}
