"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Trash2,
  Pencil,
  MoreHorizontal,
  CheckCircle,
  Eye,
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
import type { Document } from "@/lib/types";
import { TimeAgo } from "@/components/ui/time-ago";

interface DocumentTableProps {
  documents: Document[];
  onEdit?: (doc: Document) => void;
  onView?: (doc: Document) => void;
  schoolId: string;
}

export function DocumentTable({ documents, onEdit, onView, schoolId }: DocumentTableProps) {
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
      <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground">No documents yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your first document to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-accent/50 px-4 py-2 mb-3">
          <span className="text-sm font-medium">
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

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    selected.size === documents.length && documents.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Uploaded</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggleSelect(doc.id)}
                  />
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    {doc.summary && (
                      <p className="mt-0.5 max-w-sm text-xs text-muted-foreground/80 line-clamp-2">
                        {doc.summary}
                      </p>
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
                      {doc.category && (
                        <Badge
                          style={{
                            backgroundColor: doc.category.color + "20",
                            color: doc.category.color,
                          }}
                        >
                          {doc.category.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary" className="text-xs uppercase">
                    {doc.file_type}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {doc.category ? (
                    <Badge
                      style={{
                        backgroundColor: doc.category.color + "20",
                        color: doc.category.color,
                      }}
                    >
                      {doc.category.name}
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
