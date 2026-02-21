"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { clearTable, clearAllTestData, purgeDocumentChunks, getDebugInfo } from "@/actions/dev-panel";

interface CleanupTabProps {
  schoolId: string;
}

interface TableInfo {
  name: string;
  label: string;
  count: number;
}

const CONTENT_TABLES: { name: string; label: string }[] = [
  { name: "documents", label: "Documents" },
  { name: "events", label: "Events" },
  { name: "announcements", label: "Announcements" },
  { name: "categories", label: "Categories" },
  { name: "folders", label: "Folders" },
];

const USER_DATA_TABLES: { name: string; label: string }[] = [
  { name: "chat_sessions", label: "Chat Sessions" },
  { name: "analytics_events", label: "Analytics Events" },
];

const SYSTEM_TABLES: { name: string; label: string }[] = [
  { name: "audit_log", label: "Audit Log" },
  { name: "notifications", label: "Notifications" },
];

export function CleanupTab({ schoolId }: CleanupTabProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    const info = await getDebugInfo(schoolId);
    setCounts(info.tableCounts);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleClear = async (tableName: string) => {
    setClearing(tableName);
    await clearTable(tableName, schoolId);
    await fetchCounts();
    setClearing(null);
  };

  const handleClearAll = async () => {
    setClearing("all");
    await clearAllTestData(schoolId);
    await fetchCounts();
    setClearing(null);
  };

  const handlePurgeChunks = async () => {
    setClearing("chunks");
    await purgeDocumentChunks(schoolId);
    await fetchCounts();
    setClearing(null);
  };

  const renderTableRow = ({ name, label }: { name: string; label: string }) => {
    const count = counts[name] ?? 0;
    const isClearing = clearing === name;

    return (
      <div
        key={name}
        className="flex items-center justify-between rounded-md border px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{label}</span>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {loading ? "..." : count}
          </Badge>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!clearing || count === 0}
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isClearing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Clear"
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear {label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {count} {label.toLowerCase()} records
                for this school. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => handleClear(name)}
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold metallic-text mb-1">Cleanup Tools</h3>
        <p className="text-xs text-muted-foreground">
          Clear data by table. All operations are scoped to this school.
        </p>
      </div>

      {/* Content Data */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Content Data
        </h4>
        {CONTENT_TABLES.map(renderTableRow)}
      </div>

      {/* User Data */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          User Data
        </h4>
        {USER_DATA_TABLES.map(renderTableRow)}
      </div>

      {/* System Data */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          System Data
        </h4>
        {SYSTEM_TABLES.map(renderTableRow)}
      </div>

      {/* Nuclear Options */}
      <div className="space-y-2 pt-2 border-t">
        <h4 className="text-xs font-medium text-destructive uppercase tracking-wider flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Destructive Actions
        </h4>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={!!clearing}
              className="w-full"
            >
              {clearing === "all" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-2" />
              )}
              Clear All Test Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear ALL data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all documents, events, announcements,
                categories, folders, chat sessions, analytics, audit logs, and
                notifications for this school. Only user profiles and settings
                will be preserved. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleClearAll}>
                Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!!clearing}
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {clearing === "chunks" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : null}
              Purge Document Chunks Only
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Purge document chunks?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes all document chunks and embeddings without removing the
                documents themselves. Documents will need to be reprocessed to restore
                RAG search functionality.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handlePurgeChunks}>
                Purge Chunks
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
