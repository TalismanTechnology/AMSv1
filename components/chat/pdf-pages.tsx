"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { LogoSpinner } from "@/components/logo-spinner";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js, loaded on first use. The legacy build is the one that still runs on
 * the older iOS Safari versions parents' phones (and the app's web view) ship.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      const pdfjs = mod as unknown as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

interface PageSize {
  width: number;
  height: number;
}

/**
 * Renders a PDF page by page onto canvases, so it shows inline everywhere —
 * mobile browsers and the native apps can't display a PDF in an iframe. Pages
 * draw only while near the viewport, and the view scrolls to `page` whenever
 * it changes, so clicking a citation lands on the cited page.
 */
export function PdfPages({
  url,
  page,
  title,
}: {
  url: string;
  page?: number;
  title: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  // Load the document and every page's size up front, so placeholders hold
  // the right height and scrolling to a page is exact before it renders.
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setPdf(null);
    setSizes([]);
    setError(false);

    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        doc = await pdfjs.getDocument({ url }).promise;
        const next: PageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          next.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setSizes(next);
        setPdf(doc);
      } catch (err) {
        console.error("PDF render failed:", err);
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Jump to the cited page: instantly on first load, smoothly when the user
  // clicks another citation in the same document.
  const hasScrolled = useRef(false);
  useEffect(() => {
    hasScrolled.current = false;
  }, [url]);
  useEffect(() => {
    if (!sizes.length || !width) return;
    const target = Math.min(Math.max(page ?? 1, 1), sizes.length);
    const el = pageRefs.current[target - 1];
    const container = scrollRef.current;
    if (!el || !container) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTo({
        top: el.offsetTop - 12,
        behavior: hasScrolled.current ? "smooth" : "auto",
      });
      hasScrolled.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [page, sizes, width]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This PDF couldn&apos;t be shown here.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          Open {title}
        </a>
      </div>
    );
  }

  const pageWidth = Math.max(width - 24, 0);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-secondary/40 px-3 py-3"
      aria-label={title}
    >
      {!pdf ? (
        <div className="flex h-full items-center justify-center">
          <LogoSpinner size={24} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sizes.map((size, i) => (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              className={`relative overflow-hidden rounded-sm bg-white shadow-sm ${
                page === i + 1 ? "ring-2 ring-primary/50" : ""
              }`}
              style={{
                width: pageWidth,
                height: pageWidth ? (pageWidth * size.height) / size.width : 0,
              }}
            >
              <PdfPage
                pdf={pdf}
                pageNumber={i + 1}
                width={pageWidth}
                root={scrollRef}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  width,
  root,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  // Draw only pages within a screen or two of the viewport; dropping the
  // canvas for far-off pages keeps memory flat on long handbooks.
  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root: root.current, rootMargin: "1200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near || !width) return;
    let task: RenderTask | null = null;
    let cancelled = false;

    (async () => {
      const p = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: (width / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = p.render({ canvas, viewport });
      await task.promise.catch(() => {});
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, width, pdf, pageNumber]);

  return (
    <div ref={holderRef} className="absolute inset-0">
      {near && (
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label={`Page ${pageNumber}`}
        />
      )}
    </div>
  );
}
