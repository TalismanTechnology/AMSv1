"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSourcePanel } from "./source-panel-context";
import { X, FileText, Download, Maximize2 } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { getDocumentSignedUrl, getDocumentUrls } from "@/lib/storage-url";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DocumentViewer } from "@/components/shared/document-viewer";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ease, duration } from "@/lib/motion";

// Locate `chunk` inside `full` tolerating whitespace differences and trailing
// ellipsis markers that come from server-side excerpt truncation.
// Returns [start, end) indices in the original `full` string, or null if not found.
function locateChunk(full: string, chunk: string): [number, number] | null {
  if (!full || !chunk) return null;
  // Strip both ASCII "..." and the Unicode ellipsis "…" that the API appends
  // when truncating the excerpt — neither will appear in `full`.
  const cleanChunk = chunk.replace(/(?:\.{3}|…)\s*$/u, "").trim();
  if (!cleanChunk) return null;

  // Fast path: exact substring
  const direct = full.indexOf(cleanChunk);
  if (direct !== -1) return [direct, direct + cleanChunk.length];

  // Whitespace-tolerant match: build a map from normalized index -> original index
  const orig: number[] = [];
  let normalized = "";
  let prevWs = false;
  for (let i = 0; i < full.length; i++) {
    const c = full[i];
    const isWs = /\s/.test(c);
    if (isWs) {
      if (!prevWs && normalized.length > 0) {
        normalized += " ";
        orig.push(i);
      }
      prevWs = true;
    } else {
      normalized += c.toLowerCase();
      orig.push(i);
      prevWs = false;
    }
  }

  const normChunk = cleanChunk.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normChunk) return null;

  const idx = normalized.indexOf(normChunk);
  if (idx !== -1) {
    const start = orig[idx];
    const endIdx = idx + normChunk.length - 1;
    const end = (orig[endIdx] ?? full.length - 1) + 1;
    return [start, end];
  }

  // Anchor fallback: try progressively shorter prefixes (60→40→24 chars) so
  // we still find a match when the excerpt was cut mid-sentence or contains
  // light punctuation drift between excerpt and reconstructed full text.
  for (const len of [60, 40, 24]) {
    if (normChunk.length < len) continue;
    const anchor = normChunk.slice(0, len);
    const anchorIdx = normalized.indexOf(anchor);
    if (anchorIdx === -1) continue;
    const start = orig[anchorIdx];
    const tailLen = Math.min(normChunk.length, normalized.length - anchorIdx);
    const endIdx = anchorIdx + tailLen - 1;
    const end = (orig[endIdx] ?? full.length - 1) + 1;
    return [start, end];
  }
  return null;
}

const DOCX_TYPES = new Set(["docx", "doc"]);

function PanelContent() {
  const { activeSource, fullContent, isLoadingContent, closePanel } =
    useSourcePanel();
  const [viewerOpen, setViewerOpen] = useState(false);
  const highlightRef = useRef<HTMLElement>(null);

  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const documentId = activeSource?.document_id;
  const fileType = activeSource?.file_type;

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    setLoadingDoc(true);
    setViewUrl(null);
    setDownloadUrl(null);
    setHasPdf(false);
    setDocxBlob(null);

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
  }, [documentId, fileType]);

  // Render DOCX blob into container
  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current) return;
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
  }, [docxBlob]);

  const showAsPdf = !!viewUrl && (fileType === "pdf" || hasPdf);
  const showAsDocx =
    !!docxBlob && !!fileType && DOCX_TYPES.has(fileType) && !hasPdf;
  const showAsImage = !!viewUrl && !!fileType && fileType.startsWith("image");
  const canRenderInline = showAsPdf || showAsDocx || showAsImage;

  // Append #page=N to PDF view URL when the chunk has a page location, so
  // the iframe opens directly on the cited page.
  const pdfSrc = useMemo(() => {
    if (!showAsPdf || !viewUrl) return null;
    const page = activeSource?.location?.page;
    if (!page) return viewUrl;
    const separator = viewUrl.includes("#") ? "&" : "#";
    return `${viewUrl}${separator}page=${page}`;
  }, [showAsPdf, viewUrl, activeSource?.location?.page]);

  const segments = useMemo(() => {
    if (!activeSource) return null;
    const body = fullContent ?? activeSource.chunk_content;
    if (!body) return null;
    if (!fullContent) {
      // Only the chunk itself — highlight the whole thing
      return { before: "", match: body, after: "" };
    }
    const range = locateChunk(fullContent, activeSource.chunk_content);
    if (!range) return { before: body, match: "", after: "" };
    const [start, end] = range;
    return {
      before: fullContent.slice(0, start),
      match: fullContent.slice(start, end),
      after: fullContent.slice(end),
    };
  }, [fullContent, activeSource]);

  // Auto-scroll to the highlighted chunk once it renders (text fallback only)
  useEffect(() => {
    if (canRenderInline) return;
    if (!segments?.match || isLoadingContent) return;
    const el = highlightRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [segments, isLoadingContent, canRenderInline]);

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
      }
    : null;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <h3 className="truncate font-semibold text-foreground text-sm">
              {activeSource.title}
            </h3>
          </div>
          {activeSource.location?.label && (
            <p className="pl-7 text-xs text-muted-foreground">
              {activeSource.location.label}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
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
      </div>

      <div className="border-b border-border px-4 py-2">
        <Badge variant="secondary" className="text-xs">
          {Math.round(activeSource.similarity * 100)}% match
        </Badge>
      </div>

      <div className="flex-1 min-h-0 relative">
        {loadingDoc ? (
          <div className="flex items-center justify-center h-full">
            <LogoSpinner size={24} />
          </div>
        ) : showAsPdf ? (
          <iframe
            src={pdfSrc!}
            className="w-full h-full border-0"
            title={activeSource.title}
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
                alt={activeSource.title}
                className="max-w-full rounded-lg"
              />
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full px-4 py-4">
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <LogoSpinner size={24} />
              </div>
            ) : segments ? (
              <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                {segments.before}
                {segments.match && (
                  <mark
                    ref={highlightRef}
                    className="rounded-sm bg-primary/30 px-0.5 text-foreground ring-1 ring-primary/70 shadow-[0_0_12px_var(--glow-primary,oklch(0.7_0.18_220/0.5))]"
                  >
                    {segments.match}
                  </mark>
                )}
                {segments.after}
              </div>
            ) : null}
          </ScrollArea>
        )}
      </div>

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
