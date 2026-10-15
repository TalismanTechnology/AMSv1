"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  File,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDocumentSignedUrl, getDocumentUrls } from "@/lib/storage-url";
import { PdfPages } from "@/components/shared/pdf-pages";
import { SourceRenderer } from "@/components/shared/source-renderer";
import { ViewToggle, type SourceView } from "@/components/shared/view-toggle";

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: File,
  doc: File,
  txt: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  pptx: File,
  image: ImageIcon,
};

const DOCX_TYPES = new Set(["docx", "doc"]);

interface ViewerDocument {
  id: string;
  title: string;
  file_type: string;
  file_name: string;
  file_url?: string;
  source?: string | null;
  source_url?: string | null;
}

interface DocumentViewerProps {
  document: ViewerDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PDF page to open on, e.g. the page a chat citation points to. */
  page?: number;
}

export function DocumentViewer({
  document,
  open,
  onOpenChange,
  page,
}: DocumentViewerProps) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [docxView, setDocxView] = useState<SourceView>("original");
  const [hasPdf, setHasPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const loadContent = useCallback(async (doc: ViewerDocument) => {
    setLoading(true);
    setViewUrl(null);
    setDownloadUrl(null);
    setDocxBlob(null);
    setDocxView("original");
    setHasPdf(false);
    setImageZoom(1);

    // Text-only documents need nothing here: SourceRenderer fetches their
    // text itself.
    try {
      if (doc.file_url) {
        const urls = await getDocumentUrls(doc.id);
        setViewUrl(urls.viewUrl);
        setDownloadUrl(urls.downloadUrl);
        setHasPdf(urls.hasPdf);

        // For DOCX without a converted PDF, fetch the blob for client-side rendering
        if (DOCX_TYPES.has(doc.file_type) && !urls.hasPdf && urls.viewUrl) {
          const res = await fetch(urls.viewUrl);
          if (res.ok) {
            setDocxBlob(await res.blob());
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Render DOCX blob into container when available
  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current || docxView !== "original") return;

    const container = docxContainerRef.current;
    container.innerHTML = "";

    import("docx-preview").then(({ renderAsync }) => {
      renderAsync(docxBlob, container, undefined, {
        className: "docx-preview-content",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: true,
        breakPages: true,
      }).catch((err) => {
        console.error("DOCX render failed:", err);
        container.innerHTML =
          '<p class="text-sm text-muted-foreground p-4">Failed to render document preview.</p>';
      });
    });
  }, [docxBlob, docxView]);

  useEffect(() => {
    if (open && document) {
      loadContent(document);
    }
    if (!open) {
      setViewUrl(null);
      setDownloadUrl(null);
      setDocxBlob(null);
      setHasPdf(false);
      setImageZoom(1);
    }
  }, [open, document, loadContent]);

  if (!document) return null;

  const FileIcon = FILE_TYPE_ICONS[document.file_type] || FileText;

  // Determine render mode
  const showAsPdf =
    (document.file_type === "pdf" || hasPdf) && viewUrl;
  const showAsDocx =
    DOCX_TYPES.has(document.file_type) && !hasPdf && docxBlob;
  const showAsImage = document.file_type.startsWith("image") && viewUrl;

  async function handleDownload() {
    if (!document) return;
    // Always download the original file
    const url = downloadUrl || (await getDocumentSignedUrl(document.id));
    if (!url) return;
    const a = window.document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b space-y-0">
          <div className="flex items-center gap-3 pr-8">
            <FileIcon className="h-5 w-5 shrink-0 text-primary" />
            <DialogTitle className="truncate">{document.title}</DialogTitle>
            <Badge variant="secondary" className="shrink-0 text-xs uppercase">
              {document.file_type}
            </Badge>
          </div>
          <DialogDescription className="text-xs truncate">
            {document.file_name}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LogoSpinner size={32} />
            </div>
          ) : showAsPdf ? (
            <PdfPages url={viewUrl!} page={page} title={document.title} />
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
                  alt={document.title}
                  style={{ transform: `scale(${imageZoom})`, transformOrigin: "center" }}
                  className="max-w-full rounded-lg transition-transform duration-200"
                />
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="h-full">
              <div className="px-4 py-5 sm:px-6">
                <SourceRenderer
                  key={document.id}
                  documentId={document.id}
                  fileType={document.file_type}
                  source={document.source ?? undefined}
                  sourceUrl={document.source_url}
                  title={document.title}
                />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="flex items-center gap-2">
            {DOCX_TYPES.has(document.file_type) && !hasPdf && docxBlob && (
              <ViewToggle value={docxView} onChange={setDocxView} />
            )}
            {document.file_type.startsWith("image") && viewUrl && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom((z) => Math.max(0.25, z - 0.25))}
                  disabled={imageZoom <= 0.25}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">
                  {Math.round(imageZoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
                  disabled={imageZoom >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownload}
            disabled={!document.file_url}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
