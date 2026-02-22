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
}

interface DocumentViewerProps {
  document: ViewerDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentViewer({
  document,
  open,
  onOpenChange,
}: DocumentViewerProps) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const loadContent = useCallback(async (doc: ViewerDocument) => {
    setLoading(true);
    setViewUrl(null);
    setDownloadUrl(null);
    setTextContent(null);
    setDocxBlob(null);
    setHasPdf(false);
    setImageZoom(1);

    try {
      let hasPdfResult = false;
      if (doc.file_url) {
        const urls = await getDocumentUrls(doc.id);
        setViewUrl(urls.viewUrl);
        setDownloadUrl(urls.downloadUrl);
        setHasPdf(urls.hasPdf);
        hasPdfResult = urls.hasPdf;

        // For DOCX without a converted PDF, fetch the blob for client-side rendering
        if (DOCX_TYPES.has(doc.file_type) && !urls.hasPdf && urls.viewUrl) {
          const res = await fetch(urls.viewUrl);
          if (res.ok) {
            setDocxBlob(await res.blob());
          }
        }
      }

      // Load text content as fallback when no inline/PDF view is available
      const canViewInline =
        doc.file_type === "pdf" ||
        doc.file_type === "image" ||
        hasPdfResult ||
        DOCX_TYPES.has(doc.file_type);
      if (!canViewInline) {
        const res = await fetch(`/api/documents/${doc.id}/content`);
        if (res.ok) {
          const data = await res.json();
          setTextContent(data.content);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Render DOCX blob into container when available
  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current) return;

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
  }, [docxBlob]);

  useEffect(() => {
    if (open && document) {
      loadContent(document);
    }
    if (!open) {
      setViewUrl(null);
      setDownloadUrl(null);
      setTextContent(null);
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
  const showAsImage = document.file_type === "image" && viewUrl;

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
            <iframe
              src={viewUrl!}
              className="w-full h-full border-0"
              title={document.title}
            />
          ) : showAsDocx ? (
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
          ) : textContent ? (
            <ScrollArea className="h-full">
              <div className="px-6 py-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {textContent}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileIcon className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No preview available</p>
              <p className="text-xs mt-1">Download the file to view it</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="flex items-center gap-2">
            {document.file_type === "image" && viewUrl && (
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
