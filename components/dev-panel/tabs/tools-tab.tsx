"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  RefreshCcw,
  Download,
  Shield,
  ShieldCheck,
  UserCog,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  forceReprocessDocuments,
  toggleUserApproval,
  quickChangeRole,
  getTableData,
  exportDatabaseJSON,
} from "@/actions/dev-panel";

interface ToolsTabProps {
  schoolId: string;
}

// --- Force Reprocess ---
function ReprocessSection({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);

  const handleReprocess = async () => {
    setLoading(true);
    setResult(null);
    const res = await forceReprocessDocuments(schoolId);
    setLoading(false);
    if (res.success) setResult({ count: res.count ?? 0 });
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <RefreshCcw className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Force Reprocess Documents</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Clears all document chunks and re-triggers the processing pipeline for
        every ready document. This will temporarily break RAG search.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5 mr-2" />
            )}
            Reprocess All Documents
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocess all documents?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all existing embeddings and re-process every
              document. RAG search will be unavailable until processing completes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReprocess}>
              Reprocess
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {result && (
        <p className="text-xs text-green-500">
          Queued {result.count} documents for reprocessing.
        </p>
      )}
    </div>
  );
}

// --- User Management ---
interface UserRow {
  user_id: string;
  role: string;
  approved: boolean;
  profiles?: { full_name: string; email: string } | null;
  full_name?: string;
  email?: string;
}

function UserManagementSection({ schoolId }: { schoolId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const result = await getTableData("school_memberships", schoolId, 50);
    if (result.data) {
      setUsers(result.data as UserRow[]);
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleApproval = async (userId: string) => {
    setActionLoading(userId);
    await toggleUserApproval(userId, schoolId);
    await fetchUsers();
    setActionLoading(null);
  };

  const handleChangeRole = async (userId: string, role: "admin" | "parent") => {
    setActionLoading(userId);
    await quickChangeRole(userId, schoolId, role);
    await fetchUsers();
    setActionLoading(null);
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">User Management</span>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading} className="h-6 px-2">
          <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && users.length === 0 ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted-foreground">No users found.</p>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {users.map((u) => {
            const isLoading = actionLoading === u.user_id;
            return (
              <div
                key={u.user_id}
                className="flex items-center justify-between rounded border px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="truncate">
                    {u.email || u.user_id.slice(0, 8)}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${u.role === "admin" ? "border-blue-500/30 text-blue-500" : ""}`}
                  >
                    {u.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5"
                    disabled={isLoading}
                    onClick={() => handleToggleApproval(u.user_id)}
                    title={u.approved ? "Revoke approval" : "Approve"}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : u.approved ? (
                      <ShieldCheck className="h-3 w-3 text-green-500" />
                    ) : (
                      <Shield className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                  <Select
                    value={u.role}
                    onValueChange={(v) => handleChangeRole(u.user_id, v as "admin" | "parent")}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-6 w-[70px] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="parent">parent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Raw Table Viewer ---
function TableViewerSection({ schoolId }: { schoolId: string }) {
  const [selectedTable, setSelectedTable] = useState("");
  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tables = [
    "documents", "events", "announcements", "categories",
    "folders", "chat_sessions", "analytics_events",
    "audit_log", "notifications", "school_memberships",
  ];

  const handleFetch = async (table: string) => {
    setSelectedTable(table);
    setLoading(true);
    setError(null);
    const result = await getTableData(table, schoolId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setData(null);
    } else {
      setData(result.data as unknown[]);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Raw Table Viewer</span>
      </div>
      <Select value={selectedTable} onValueChange={handleFetch}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select a table..." />
        </SelectTrigger>
        <SelectContent>
          {tables.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {data && !loading && (
        <div className="max-h-[300px] overflow-auto rounded border bg-background p-2">
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Export ---
function ExportSection({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    const data = await exportDatabaseJSON(schoolId);
    setLoading(false);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `school-data-${schoolId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Export Database</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Download all content data (documents, events, announcements, categories,
        folders) as a JSON file.
      </p>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={loading} className="w-full">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
        ) : (
          <Download className="h-3.5 w-3.5 mr-2" />
        )}
        Export as JSON
      </Button>
    </div>
  );
}

export function ToolsTab({ schoolId }: ToolsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold metallic-text mb-1">Advanced Tools</h3>
        <p className="text-xs text-muted-foreground">
          Developer utilities for managing the system.
        </p>
      </div>

      <ReprocessSection schoolId={schoolId} />
      <UserManagementSection schoolId={schoolId} />
      <TableViewerSection schoolId={schoolId} />
      <ExportSection schoolId={schoolId} />
    </div>
  );
}
