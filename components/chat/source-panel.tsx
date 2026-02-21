"use client";

import { useState } from "react";
import { useSourcePanel } from "./source-panel-context";
import { X, FileText, Loader2, Download, Eye } from "lucide-react";
import { getDocumentSignedUrl } from "@/lib/storage-url";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DocumentViewer } from "@/components/shared/document-viewer";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ease, duration } from "@/lib/motion";

function PanelContent() {
  const { activeSource, fullContent, isLoadingContent, closePanel } =
    useSourcePanel();
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!activeSource) return null;

  async function handleDownload() {
    if (!activeSource?.document_id) return;
    const url = await getDocumentSignedUrl(activeSource.document_id);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  const viewerDoc = activeSource
    ? {
        id: activeSource.document_id,
        title: activeSource.title,
        file_type: activeSource.file_type || "txt",
        file_name: activeSource.title,
        file_url: activeSource.file_url,
      }
    : null;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <h3 className="truncate font-semibold text-foreground text-sm">
            {activeSource.title}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {activeSource.file_url && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setViewerOpen(true)}
                title="View document"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDownload}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-xs" onClick={closePanel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-4 py-2">
        <Badge variant="secondary" className="text-xs">
          {Math.round(activeSource.similarity * 100)}% match
        </Badge>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {isLoadingContent ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
            {fullContent || activeSource.chunk_content}
          </div>
        )}
      </ScrollArea>

      <DocumentViewer
        document={viewerDoc}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
    </>
  );
}

export function SourcePanel() {
  const { isOpen, closePanel } = useSourcePanel();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  if (isDesktop) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: duration.normal, ease: ease.smooth }}
            className="flex h-full flex-col overflow-hidden border-l border-border bg-card neon-border"
          >
            <PanelContent />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closePanel()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
        showCloseButton={false}
      >
        <PanelContent />
      </SheetContent>
    </Sheet>
  );
}
