"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSourcePanel } from "./source-panel-context";
import { X, FileText, Download, Maximize2, ExternalLink } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { getDocumentSignedUrl, getDocumentUrls } from "@/lib/storage-url";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ease, duration } from "@/lib/motion";
import { ViewToggle, type SourceView } from "@/components/shared/view-toggle";

// The document viewers are only needed once a source is opened, so they load
// in their own chunks instead of with the chat page.
const PdfPages = dynamic(
  () => import("@/components/shared/pdf-pages").then((m) => m.PdfPages),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <LogoSpinner size={24} />
      </div>
    ),
  }
);
const DocumentViewer = dynamic(
  () => import("@/components/shared/document-viewer").then((m) => m.DocumentViewer),
  { ssr: false }
);
const SourceRenderer = dynamic(
  () => import("@/components/shared/source-renderer").then((m) => m.SourceRenderer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size={24} />
      </div>
    ),
  }
);

const DOCX_TYPES = new Set(["docx", "doc"]);

function PanelContent() {
  const { activeSource, fullContent, isLoadingContent, closePanel } =
    useSourcePanel();
  const [viewerOpen, setViewerOpen] = useState(false);

  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [docxView, setDocxView] = useState<SourceView>("original");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const documentId = activeSource?.document_id;
  const fileType = activeSource?.file_type;
  const isDocument = !activeSource?.source_type || activeSource.source_type === "document";

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    setLoadingDoc(isDocument);
    setViewUrl(null);
    setDownloadUrl(null);
    setHasPdf(false);
    setDocxBlob(null);
    setDocxView("original");
    // Events, announcements and admin clarifications have no file to fetch.
    if (!isDocument) return;

    (async () => {
      const urls = await getDocumentUrls(documentId);
      if (cancelled) return;
      setViewUrl(urls.viewUrl);
      setDownloadUrl(urls.downloadUrl);
      setHasPdf(urls.hasPdf);

      if (fileType && DOCX_TYPES.has(fileType) && !urls.hasPdf && urls.viewUrl) {
        const res = await fetch(urls.viewUrl);
        if (!cancelled && res.ok) {
          setDocxBlob(await res.blob());
        }
      }
      if (!cancelled) setLoadingDoc(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, fileType, isDocument]);

  // Render DOCX blob into container
  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current || docxView !== "original") return;
    const container = docxContainerRef.current;
    container.innerHTML = "";
    import("docx-preview").then(({ renderAsync }) => {
      renderAsync(docxBlob, container, undefined, {
        className: "docx-preview-content",
        inWrapper: true,
        ignoreWidth: true,
        ignoreHeight: true,
        breakPages: true,
      }).catch((err) => {
        console.error("DOCX render failed:", err);
        container.innerHTML =
          '<p class="text-sm text-muted-foreground p-4">Failed to render document preview.</p>';
      });
    });
  }, [docxBlob, docxView]);

  const showAsPdf = !!viewUrl && (fileType === "pdf" || hasPdf);
  const showAsDocx =
    !!docxBlob && !!fileType && DOCX_TYPES.has(fileType) && !hasPdf;
  const showAsImage = !!viewUrl && !!fileType && fileType.startsWith("image");
  if (!activeSource) return null;

  async function handleDownload() {
    if (!activeSource?.document_id) return;
    const url = downloadUrl || (await getDocumentSignedUrl(activeSource.document_id));
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
        source: activeSource.source_url ? "website" : undefined,
        source_url: activeSource.source_url,
      }
    : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: ease.out, delay: 0.05 }}
        className="flex items-center justify-between border-b border-border px-4 py-3"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-medium text-ink">
              {activeSource.title}
            </h3>
          </div>
          {(activeSource.source_number != null || activeSource.location?.label) && (
            <p className="pl-6 text-xs text-muted-foreground">
              {[
                activeSource.source_number != null ? `Source ${activeSource.source_number}` : null,
                activeSource.location?.label,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeSource.source_url && (
            <Button asChild variant="ghost" size="icon-xs" title="Open the web page">
              <a href={activeSource.source_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          {activeSource.file_url && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setViewerOpen(true)}
                title="Open fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
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
      </motion.div>

      {showAsDocx && !loadingDoc && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <ViewToggle value={docxView} onChange={setDocxView} />
          <Button variant="ghost" size="xs" onClick={handleDownload}>
            <Download />
            Download
          </Button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: ease.out, delay: 0.22 }}
        className="flex-1 min-h-0 relative"
      >
        {loadingDoc ? (
          <div className="flex items-center justify-center h-full">
            <LogoSpinner size={24} />
          </div>
        ) : showAsPdf ? (
          <PdfPages
            url={viewUrl!}
            page={activeSource.location?.page}
            title={activeSource.title}
          />
        ) : showAsDocx && docxView === "original" ? (
          <ScrollArea className="h-full">
            <div
              ref={docxContainerRef}
              className="docx-viewer-container p-4 min-h-full"
            />
          </ScrollArea>
        ) : showAsImage ? (
          <ScrollArea className="h-full">
            <div className="flex items-center justify-center p-4 min-h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewUrl!}
                alt={activeSource.title}
                className="max-w-full rounded-lg"
              />
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-4 py-5 sm:px-6">
              {!isDocument ? (
                <SourceRenderer
                  key={`${activeSource.document_id}-text`}
                  text={fullContent ?? activeSource.chunk_content}
                  title={activeSource.title}
                />
              ) : isLoadingContent && !showAsDocx ? (
                <div className="flex items-center justify-center py-12">
                  <LogoSpinner size={24} />
                </div>
              ) : (
                <SourceRenderer
                  key={activeSource.document_id}
                  documentId={activeSource.document_id}
                  fileType={fileType}
                  source={activeSource.source_url ? "website" : undefined}
                  sourceUrl={activeSource.source_url}
                  title={activeSource.title}
                  fallbackText={fullContent}
                />
              )}
            </div>
          </ScrollArea>
        )}
      </motion.div>

      <DocumentViewer
        document={viewerDoc}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        page={activeSource.location?.page}
      />
    </>
  );
}

export function SourcePanel() {
  const { isOpen, closePanel, activeSource } = useSourcePanel();
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
            className="flex h-full flex-col overflow-hidden border-l border-border bg-background"
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
        {/* The visible header is PanelContent's; these name the dialog for
            screen readers, which Radix requires of every sheet. */}
        <SheetTitle className="sr-only">{activeSource?.title ?? "Source"}</SheetTitle>
        <SheetDescription className="sr-only">
          The school document this answer cites.
        </SheetDescription>
        <PanelContent />
      </SheetContent>
    </Sheet>
  );
}
