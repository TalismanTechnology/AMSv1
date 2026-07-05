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
      <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-ink-soft">
          {index != null ? (
            <span className="mr-1">[{index}]</span>
          ) : null}
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
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary",
            isOpen ? "rounded-t-lg bg-secondary" : "rounded-lg"
          )}
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-ink-soft">
            {index != null ? (
              <span className="mr-1">[{index}]</span>
            ) : null}
            {source.title}
            {source.location?.label && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                · {source.location.label}
              </span>
            )}
          </span>
          {source.file_type && (
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
              {source.file_type}
            </Badge>
          )}
          {source.similarity != null && (
            <span className="shrink-0 text-[0.65rem] font-medium tabular-nums text-muted-foreground">
              {Math.round(source.similarity * 100)}%
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 rounded-b-lg bg-secondary px-2 py-2.5">
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
