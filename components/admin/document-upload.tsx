"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  X,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createDocumentRecord } from "@/actions/documents";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Category, Folder } from "@/lib/types";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt"],
};

const TYPE_MAP: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  txt: "txt",
};

type FileStatus = "idle" | "uploading" | "processing" | "ready" | "error";

interface UploadItem {
  id: string;
  file: File;
  title: string;
  status: FileStatus;
  documentId?: string;
  progress: number;
  error?: string;
  summary?: string;
}

interface DocumentUploadProps {
  categories: Category[];
  folders: Folder[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFolderId?: string | null;
  schoolId: string;
}

export function DocumentUpload({
  categories,
  folders,
  open,
  onOpenChange,
  selectedFolderId,
  schoolId,
}: DocumentUploadProps) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [folderId, setFolderId] = useState(selectedFolderId || "none");
  const [tags, setTags] = useState("");
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      const newItems: UploadItem[] = accepted.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        title: f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        status: "idle" as FileStatus,
        progress: 0,
      }));
      setItems((prev) => [...prev, ...newItems].slice(0, 10));
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 10,
    maxSize: 50 * 1024 * 1024,
  });

  function updateItem(id: string, updates: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const interval = pollingRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollingRef.current.delete(id);
    }
  }

  function startPolling(itemId: string, documentId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "ready" || data.status === "error") {
          clearInterval(interval);
          pollingRef.current.delete(itemId);

          updateItem(itemId, {
            status: data.status,
            summary: data.summary,
            error: data.error_message,
          });

          if (data.status === "ready") {
            router.refresh();
          }
        }
      } catch {
        // Transient polling failure — ignore
      }
    }, 2500);
    pollingRef.current.set(itemId, interval);
  }

  async function uploadItem(item: UploadItem) {
    const supabase = createClient();

    updateItem(item.id, { status: "uploading", progress: 10 });

    const ext = item.file.name.split(".").pop()?.toLowerCase() || "";
    const fileType = TYPE_MAP[ext] || "txt";
    const timestamp = Date.now();
    const storageKey = `${schoolId}/${timestamp}-${item.file.name}`;

    // Upload to Supabase Storage directly from browser
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storageKey, item.file);

    if (uploadError) {
      updateItem(item.id, { status: "error", error: uploadError.message });
      return;
    }

    updateItem(item.id, { status: "processing", progress: 100 });

    // Create DB record + trigger processing
    const result = await createDocumentRecord({
      storageKey,
      fileName: item.file.name,
      fileType,
      fileSize: item.file.size,
      title: item.title,
      categoryId: categoryId || undefined,
      folderId: folderId === "none" ? undefined : folderId,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      schoolId,
    });

    if (result.error || !result.documentId) {
      updateItem(item.id, {
        status: "error",
        error: result.error || "Failed to create record",
      });
      return;
    }

    updateItem(item.id, { documentId: result.documentId });
    startPolling(item.id, result.documentId);
  }

  async function handleUploadAll() {
    const idleItems = items.filter((i) => i.status === "idle");
    if (!idleItems.length) return;

    await Promise.allSettled(idleItems.map((item) => uploadItem(item)));
  }

  function handleClose() {
    const inFlight = items.some(
      (i) => i.status === "uploading" || i.status === "processing"
    );
    if (inFlight) {
      toast.warning("Please wait for all uploads to complete.");
      return;
    }
    onOpenChange(false);
    setItems([]);
    setCategoryId("");
    setFolderId(selectedFolderId || "none");
    setTags("");
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach(clearInterval);
    };
  }, []);

  const hasIdle = items.some((i) => i.status === "idle");
  const allDone = items.length > 0 && items.every((i) => i.status === "ready" || i.status === "error");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mb-2 h-6 w-6 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">
              {isDragActive
                ? "Drop files here..."
                : "Drag & drop files, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              PDF, Word, Excel, PowerPoint, Text (max 10 files, 50MB each)
            </p>
          </div>

          {/* File list */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input
                      value={item.title}
                      onChange={(e) =>
                        updateItem(item.id, { title: e.target.value })
                      }
                      className="h-7 text-sm"
                      disabled={item.status !== "idle"}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      {item.status === "uploading" && (
                        <Progress
                          value={item.progress}
                          className="h-1.5 flex-1"
                        />
                      )}
                      {item.status === "processing" && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Processing
                        </Badge>
                      )}
                      {item.status === "ready" && (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 text-xs dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Ready
                        </Badge>
                      )}
                      {item.status === "error" && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertCircle className="h-2.5 w-2.5" />
                          Error
                        </Badge>
                      )}
                    </div>
                    {item.status === "error" && item.error && (
                      <p className="text-xs text-destructive">
                        {item.error}
                      </p>
                    )}
                    {item.status === "ready" && item.summary && (
                      <p className="line-clamp-2 text-xs italic text-muted-foreground">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  {(item.status === "idle" || item.status === "error") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => removeItem(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Shared metadata */}
          {items.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Applied to all files
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Folder</Label>
                  <Select value={folderId} onValueChange={setFolderId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No folder</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. handbook, policies, 2025"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} size="sm">
              {allDone ? "Done" : "Cancel"}
            </Button>
            {hasIdle && (
              <Button onClick={handleUploadAll} size="sm" disabled={!hasIdle}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Upload {items.filter((i) => i.status === "idle").length} file
                {items.filter((i) => i.status === "idle").length !== 1 && "s"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
