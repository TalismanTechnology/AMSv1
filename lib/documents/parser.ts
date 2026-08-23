import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { ChunkMetadata } from "@/lib/ai/rag";

const VISION_PROMPT = `You are extracting content from a school document for a search index that parents will query. Do BOTH of the following in your output:

1. TRANSCRIBE every piece of visible text verbatim, preserving structure (headings, bullets, tables, dates, names). For tables, lay them out row-by-row in plain text.
2. DESCRIBE any non-text visual content (diagrams, charts, photos, schedules, maps, logos) in enough detail that a parent searching for the topic would find it. Note what the image shows, any labels, and any information conveyed by layout (e.g. "calendar grid showing Mon–Fri across the top, weeks down the side").

Do not editorialize. Do not omit content. If a section is unreadable, say "[unreadable]" rather than skipping it.`;

// A logical region of a source document — one page of a PDF, one sheet of an
// XLSX, one slide of a PPTX, etc. The chunker uses `metadata` to tag every
// chunk it produces from this segment so the source citation can later say
// "p. 14" or "Sheet: Q3 Sales" without re-parsing the original file.
export interface ParsedSegment {
  text: string;
  metadata: ChunkMetadata;
}

// Primary extraction entry point: returns one segment per logical region.
// Always returns at least one segment for non-empty input.
export async function extractSegments(
  buffer: Buffer,
  fileType: string
): Promise<ParsedSegment[]> {
  if (fileType === "txt") {
    return [{ text: buffer.toString("utf-8"), metadata: {} }];
  }

  if (fileType === "eml") {
    return extractEmlSegments(buffer).catch((err) => {
      console.warn("[parser] EML parse failed, falling back to raw text:", err);
      return [{ text: buffer.toString("utf-8"), metadata: {} }];
    });
  }

  if (fileType === "pdf") {
    return extractPdfSegments(buffer);
  }

  if (fileType === "xlsx" || fileType === "xls") {
    return extractXlsxSegments(buffer).catch((err) => {
      console.warn("[parser] XLSX structured parse failed, falling back:", err);
      return officeParserFallback(buffer);
    });
  }

  if (fileType === "pptx") {
    return extractPptxSegments(buffer).catch((err) => {
      console.warn("[parser] PPTX structured parse failed, falling back:", err);
      return officeParserFallback(buffer);
    });
  }

  if (fileType === "docx" || fileType === "doc") {
    return extractDocxSegments(buffer).catch((err) => {
      console.warn("[parser] DOCX structured parse failed, falling back:", err);
      return officeParserFallback(buffer);
    });
  }

  // Unknown type — best-effort flat text via officeparser
  return officeParserFallback(buffer);
}

// One segment for the whole message. The subject rides along in metadata so
// every chunk split out of a long email still cites which email it came from,
// not just the document title.
async function extractEmlSegments(buffer: Buffer): Promise<ParsedSegment[]> {
  const { parseEml } = await import("./eml");
  const email = await parseEml(buffer);

  if (!email.text.trim()) return [];

  return [{ text: email.text, metadata: { email_subject: email.subject } }];
}

async function officeParserFallback(
  buffer: Buffer
): Promise<ParsedSegment[]> {
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(buffer);
  return [{ text: ast.toText(), metadata: {} }];
}

// Backwards-compatible flat-text extraction. Use only when structural location
// metadata isn't needed (summary generation, .txt fallback storage).
export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const segments = await extractSegments(buffer, fileType);
  return segments.map((s) => s.text).join("\n\n");
}

async function extractPdfSegments(buffer: Buffer): Promise<ParsedSegment[]> {
  let segments: ParsedSegment[] = [];
  let totalChars = 0;

  try {
    // pdfjs-dist 5.x ships its Node-friendly build under /legacy/build/pdf.mjs.
    // It's listed in next.config.ts `serverExternalPackages` so Turbopack
    // doesn't try to bundle it.
    const pdfjs: typeof import("pdfjs-dist") = await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    );

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // No worker available in Node; pdfjs falls back to main-thread parsing.
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const text = reconstructPageText(content.items);
      totalChars += text.length;
      if (text.trim().length > 0) {
        segments.push({ text, metadata: { page: pageNum } });
      }
      page.cleanup();
    }
    await pdf.cleanup();
    await pdf.destroy();
  } catch (err) {
    console.warn("[parser] pdfjs failed on PDF:", err);
    segments = [];
  }

  // Heuristic: a real text-layer PDF yields ~1000+ chars per page. <200 total
  // = almost certainly a scanned/image PDF. Fall back to Gemini Vision on the
  // whole document. We lose per-page location info in that case.
  if (totalChars < 200) {
    console.log(
      `[parser] PDF text-layer extraction yielded ${totalChars} chars — falling back to Gemini Vision`
    );
    try {
      const text = await extractWithVision(buffer, "application/pdf");
      return [{ text, metadata: {} }];
    } catch (visionErr) {
      console.error("[parser] Vision fallback failed:", visionErr);
      // Return whatever we got, even if short — better than throwing.
      return segments.length > 0 ? segments : [{ text: "", metadata: {} }];
    }
  }

  return segments;
}

// pdfjs gives us positioned glyph runs. Rebuild lines by watching the Y
// coordinate (`transform[5]`) and inserting a newline whenever it shifts more
// than a few units — which corresponds to a new visual line.
interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

function reconstructPageText(items: unknown[]): string {
  const lines: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;

  for (const raw of items) {
    const item = raw as PdfTextItem;
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5];

    if (typeof y === "number" && lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.trim()) lines.push(currentLine.trimEnd());
      currentLine = "";
    }

    currentLine += item.str;
    if (item.hasEOL) {
      if (currentLine.trim()) lines.push(currentLine.trimEnd());
      currentLine = "";
    } else {
      currentLine += " ";
    }
    if (typeof y === "number") lastY = y;
  }

  if (currentLine.trim()) lines.push(currentLine.trimEnd());
  // Collapse runs of empty lines to single paragraph breaks
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ────────────────────────────────────────────────────────────────────────────
// OOXML structural parsers — DOCX / XLSX / PPTX
//
// All three formats are zip archives of XML files. We pull just the bits we
// need: sheet names + cell text for XLSX, slide order + text for PPTX,
// heading-aware paragraph stream for DOCX. The XML is parsed with regex —
// OOXML's text-bearing elements are well-defined and the surrounding markup
// is verbose-but-predictable, so this is safer than it sounds.
// ────────────────────────────────────────────────────────────────────────────

// Strip XML tags, decode the handful of XML entities OOXML actually emits.
function xmlText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractXlsxSegments(
  buffer: Buffer
): Promise<ParsedSegment[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // sharedStrings.xml — the dictionary cells reference by index
  const sharedStrings: string[] = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const xml = await sharedFile.async("string");
    // Each <si> entry can contain one or more <t> runs we concatenate
    const siBlocks = xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const block of siBlocks) {
      const runs = block.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      sharedStrings.push(runs.map((r) => xmlText(r)).join(""));
    }
  }

  // workbook.xml — sheet names + relationships order
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml) throw new Error("workbook.xml missing");
  const sheetMeta: { name: string; rid: string; sheetId: string }[] = [];
  const sheetTagRe = /<sheet\b([^/]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = sheetTagRe.exec(workbookXml)) !== null) {
    const attrs = m[1];
    const name = /\sname="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const rid = /\sr:id="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const sheetId = /\ssheetId="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (name) sheetMeta.push({ name, rid, sheetId });
  }

  // workbook.xml.rels — maps r:id → worksheet file path
  const relsXml = await zip
    .file("xl/_rels/workbook.xml.rels")
    ?.async("string");
  const ridToPath = new Map<string, string>();
  if (relsXml) {
    const relRe = /<Relationship\b([^/]*?)\/>/g;
    let r: RegExpExecArray | null;
    while ((r = relRe.exec(relsXml)) !== null) {
      const id = /\sId="([^"]*)"/.exec(r[1])?.[1];
      const target = /\sTarget="([^"]*)"/.exec(r[1])?.[1];
      if (id && target) ridToPath.set(id, target);
    }
  }

  const segments: ParsedSegment[] = [];
  for (const sheet of sheetMeta) {
    const target = ridToPath.get(sheet.rid);
    if (!target) continue;
    // Targets are relative to xl/, e.g. "worksheets/sheet1.xml"
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`;
    const sheetXml = await zip.file(path)?.async("string");
    if (!sheetXml) continue;

    const rows: string[] = [];
    const rowBlocks = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
    for (const row of rowBlocks) {
      const cells: string[] = [];
      const cellBlocks = row.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^/]*\/>/g) || [];
      for (const cell of cellBlocks) {
        const typeAttr = /\st="([^"]*)"/.exec(cell)?.[1];
        if (typeAttr === "s") {
          // Shared string reference
          const ref = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1];
          const idx = ref ? parseInt(ref, 10) : NaN;
          if (!isNaN(idx) && sharedStrings[idx] !== undefined) {
            cells.push(sharedStrings[idx]);
          }
        } else if (typeAttr === "inlineStr") {
          const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cell)?.[1] ?? "";
          const runs = inline.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
          cells.push(runs.map((r) => xmlText(r)).join(""));
        } else {
          const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1];
          if (v) cells.push(v);
        }
      }
      if (cells.length > 0) rows.push(cells.join("\t"));
    }

    const text = rows.join("\n").trim();
    if (text.length > 0) {
      segments.push({ text, metadata: { sheet: sheet.name } });
    }
  }

  if (segments.length === 0) {
    // Empty workbook (or parser drift) — fall back to flat text
    return officeParserFallback(buffer);
  }
  return segments;
}

async function extractPptxSegments(
  buffer: Buffer
): Promise<ParsedSegment[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // presentation.xml.rels resolves slide IDs → slide file paths in the
  // canonical slide order recorded in presentation.xml.
  const presXml = await zip.file("ppt/presentation.xml")?.async("string");
  if (!presXml) throw new Error("presentation.xml missing");
  const sldIds: string[] = [];
  const sldIdRe = /<p:sldId\b[^/]*?\sr:id="([^"]*)"/g;
  let s: RegExpExecArray | null;
  while ((s = sldIdRe.exec(presXml)) !== null) sldIds.push(s[1]);

  const presRels = await zip
    .file("ppt/_rels/presentation.xml.rels")
    ?.async("string");
  const ridToPath = new Map<string, string>();
  if (presRels) {
    const relRe = /<Relationship\b([^/]*?)\/>/g;
    let r: RegExpExecArray | null;
    while ((r = relRe.exec(presRels)) !== null) {
      const id = /\sId="([^"]*)"/.exec(r[1])?.[1];
      const target = /\sTarget="([^"]*)"/.exec(r[1])?.[1];
      if (id && target) ridToPath.set(id, target);
    }
  }

  const segments: ParsedSegment[] = [];
  let slideNum = 0;
  for (const rid of sldIds) {
    slideNum++;
    const target = ridToPath.get(rid);
    if (!target) continue;
    // Targets like "slides/slide1.xml" — resolve relative to ppt/
    const path = target.startsWith("/")
      ? target.slice(1)
      : `ppt/${target.replace(/^\.\//, "")}`;
    const slideXml = await zip.file(path)?.async("string");
    if (!slideXml) continue;

    // PPTX text lives inside <a:t>...</a:t> runs. Paragraphs are <a:p>.
    const paragraphs: string[] = [];
    const pBlocks = slideXml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) || [];
    for (const p of pBlocks) {
      const runs = p.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g) || [];
      const line = runs.map((r) => xmlText(r)).join("").trim();
      if (line) paragraphs.push(line);
    }
    const text = paragraphs.join("\n").trim();
    if (text.length > 0) {
      segments.push({ text, metadata: { slide: slideNum } });
    }
  }

  if (segments.length === 0) return officeParserFallback(buffer);
  return segments;
}

async function extractDocxSegments(
  buffer: Buffer
): Promise<ParsedSegment[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("word/document.xml missing");

  // Walk paragraphs in order. Each paragraph may declare a style via
  // <w:pStyle w:val="..."/>. Heading paragraphs (Heading1..Heading9, "Title",
  // "Subtitle") start a new section; their text becomes the section name and
  // subsequent body paragraphs belong to that section.
  const pBlocks = docXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  type Section = { name: string | null; lines: string[] };
  const sections: Section[] = [{ name: null, lines: [] }];

  for (const p of pBlocks) {
    const style = /<w:pStyle\b[^/]*\sw:val="([^"]*)"/.exec(p)?.[1] ?? "";
    const runs = p.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    const text = runs.map((r) => xmlText(r)).join("").trim();
    if (!text) continue;

    if (/^Heading[1-9]$/i.test(style) || /^(Title|Subtitle)$/i.test(style)) {
      sections.push({ name: text, lines: [] });
    } else {
      sections[sections.length - 1].lines.push(text);
    }
  }

  const segments: ParsedSegment[] = [];
  for (const sec of sections) {
    const text = [sec.name, ...sec.lines].filter(Boolean).join("\n").trim();
    if (text.length === 0) continue;
    segments.push({
      text,
      metadata: sec.name ? { section: sec.name } : {},
    });
  }

  if (segments.length === 0) return officeParserFallback(buffer);
  return segments;
}

async function extractWithVision(
  buffer: Buffer,
  mediaType: string
): Promise<string> {
  const base64 = buffer.toString("base64");
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: base64, mediaType },
          { type: "text", text: VISION_PROMPT },
        ],
      },
    ],
    // Allow long outputs for multi-page PDFs
    maxOutputTokens: 16384,
    temperature: 0,
  });
  return text.trim();
}
