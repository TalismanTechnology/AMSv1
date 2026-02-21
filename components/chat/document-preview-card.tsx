"use client";

import { useState } from "react";
import {
  FileText,
  File,
  FileSpreadsheet,
  Image,
  Megaphone,
  CalendarDays,
  ChevronDown,
  Download,
  PanelRight,
  Eye,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSourcePanel } from "./source-panel-context";
import { DocumentViewer } from "@/components/shared/document-viewer";
import { getDocumentSignedUrl } from "@/lib/storage-url";
import type { ChatSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: File,
  doc: File,
  txt: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  pptx: File,
  image: Image,
};

const SOURCE_TYPE_CONFIG = {
  announcement: { icon: Megaphone, label: "Announcement" },
  event: { icon: CalendarDays, label: "Event" },
};

interface DocumentPreviewCardProps {
  source: ChatSource;
  index?: number;
  defaultExpanded?: boolean;
}

export function DocumentPreviewCard({
  source,
  index,
  defaultExpanded = false,
}: DocumentPreviewCardProps) {
  const sourceType = source.source_type || "document";

  // Non-document sources render as a simple card (no expand)
  if (sourceType === "announcement" || sourceType === "event") {
    const config = SOURCE_TYPE_CONFIG[sourceType];
    const Icon = config.icon;
    return (
      <div className="metallic-card flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {index != null ? `[${index}] ` : ""}
          {source.title}
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {config.label}
        </Badge>
      </div>
    );
  }

  return <DocumentSourceCard source={source} index={index} defaultExpanded={defaultExpanded} />;
}

/** Expandable card for document sources with view/download actions. */
function DocumentSourceCard({
  source,
  index,
  defaultExpanded = false,
}: DocumentPreviewCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { openSource } = useSourcePanel();

  const FileIcon = FILE_TYPE_ICONS[source.file_type || ""] || FileText;

  async function handleDownload() {
    if (!source.document_id) return;
    const url = await getDocumentSignedUrl(source.document_id);
    if (!url) return;
    // Use an anchor element to avoid popup blockers (window.open after await gets blocked)
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  const viewerDoc = {
    id: source.document_id,
    title: source.title,
    file_type: source.file_type || "txt",
    file_name: source.title,
    file_url: source.file_url,
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="metallic-card flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/80">
          <FileIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {index != null ? `[${index}] ` : ""}
            {source.title}
          </span>
          {source.file_type && (
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
              {source.file_type}
            </Badge>
          )}
          {source.similarity != null && (
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
              {Math.round(source.similarity * 100)}%
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="rounded-b-lg border border-t-0 border-border bg-card px-3 py-3 space-y-3">
          {/* Action bar — shown first so buttons are always accessible */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setViewerOpen(true)}
            >
              <Eye className="h-3 w-3" />
              Open viewer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => openSource(source)}
            >
              <PanelRight className="h-3 w-3" />
              Open in sidebar
            </Button>
            {source.file_url && (
              <Button type="button" variant="ghost" size="xs" onClick={handleDownload}>
                <Download className="h-3 w-3" />
                Download
              </Button>
            )}
          </div>


        </CollapsibleContent>
      </Collapsible>

      <DocumentViewer
        document={viewerDoc}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
    </>
  );
}
