"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Server, Database, HardDrive, AlertCircle } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDebugInfo } from "@/actions/dev-panel";

interface DebugTabProps {
  schoolId: string;
}

interface DebugData {
  tableCounts: Record<string, number>;
  embeddingStats: {
    totalChunks: number;
    docsWithChunks: number;
    avgChunksPerDoc: number;
  };
  recentErrors: {
    id: string;
    title: string;
    error_message: string | null;
    updated_at: string;
  }[];
  storageBuckets: { name: string; public: boolean }[];
  environment: {
    nodeVersion: string;
    nextVersion: string;
  };
}

function countColor(count: number): string {
  if (count === 0) return "text-muted-foreground";
  if (count < 50) return "text-green-500";
  if (count < 200) return "text-yellow-500";
  return "text-orange-500";
}

export function DebugTab({ schoolId }: DebugTabProps) {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const info = await getDebugInfo(schoolId);
    setData(info as DebugData);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size={20} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold metallic-text mb-1">Debug Info</h3>
          <p className="text-xs text-muted-foreground">System stats and diagnostics.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="h-7"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Environment */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          Environment
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Node.js</span>
            <span className="font-mono">{data.environment.nodeVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Next.js</span>
            <span className="font-mono">{data.environment.nextVersion}</span>
          </div>
        </div>
      </div>

      {/* Table Counts */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          Table Row Counts
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(data.tableCounts).map(([table, count]) => (
            <div key={table} className="flex justify-between py-0.5">
              <span className="text-muted-foreground truncate">{table}</span>
              <span className={`font-mono tabular-nums ${countColor(count)}`}>
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Embedding Stats */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" />
          Embedding Stats
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums">
              {data.embeddingStats.totalChunks.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">Total Chunks</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums">
              {data.embeddingStats.docsWithChunks}
            </div>
            <div className="text-xs text-muted-foreground">Docs w/ Chunks</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums">
              {data.embeddingStats.avgChunksPerDoc}
            </div>
            <div className="text-xs text-muted-foreground">Avg per Doc</div>
          </div>
        </div>
      </div>

      {/* Storage Buckets */}
      {data.storageBuckets.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            Storage Buckets
          </div>
          <div className="space-y-1">
            {data.storageBuckets.map((bucket) => (
              <div key={bucket.name} className="flex items-center justify-between text-xs">
                <span className="font-mono">{bucket.name}</span>
                <Badge variant="outline" className="text-xs">
                  {bucket.public ? "public" : "private"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          Recent Processing Errors
        </div>
        {data.recentErrors.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 py-1">No recent errors</p>
        ) : (
          <div className="space-y-2">
            {data.recentErrors.map((err) => (
              <div key={err.id} className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs">
                <div className="font-medium truncate">{err.title}</div>
                <div className="text-destructive mt-0.5 line-clamp-2">
                  {err.error_message || "Unknown error"}
                </div>
                <div className="text-muted-foreground mt-1 text-[10px]">
                  {new Date(err.updated_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
