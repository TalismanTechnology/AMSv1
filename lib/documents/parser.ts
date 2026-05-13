import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const VISION_PROMPT = `You are extracting content from a school document for a search index that parents will query. Do BOTH of the following in your output:

1. TRANSCRIBE every piece of visible text verbatim, preserving structure (headings, bullets, tables, dates, names). For tables, lay them out row-by-row in plain text.
2. DESCRIBE any non-text visual content (diagrams, charts, photos, schedules, maps, logos) in enough detail that a parent searching for the topic would find it. Note what the image shows, any labels, and any information conveyed by layout (e.g. "calendar grid showing Mon–Fri across the top, weeks down the side").

Do not editorialize. Do not omit content. If a section is unreadable, say "[unreadable]" rather than skipping it.`;

const IMAGE_MIME_TYPES: Record<string, string> = {
  image_png: "image/png",
  image_jpeg: "image/jpeg",
  image_webp: "image/webp",
};

export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  // Plain text: no parsing needed
  if (fileType === "txt") {
    return buffer.toString("utf-8");
  }

  // Images: Gemini Vision (OCR + visual description)
  if (fileType.startsWith("image")) {
    const mediaType = IMAGE_MIME_TYPES[fileType] || "image/png";
    return extractWithVision(buffer, mediaType);
  }

  // PDFs: try officeparser first (fast for text-layer PDFs).
  // If it returns little/no text, fall back to Gemini Vision on the raw PDF
  // (Gemini accepts application/pdf directly and handles scanned PDFs).
  if (fileType === "pdf") {
    let text = "";
    try {
      const { OfficeParser } = await import("officeparser");
      const ast = await OfficeParser.parseOffice(buffer);
      text = ast.toText().trim();
    } catch (err) {
      console.warn("[parser] officeparser failed on PDF, will try vision:", err);
    }

    // Heuristic: a real text-layer PDF page yields ~1000+ chars. If we got
    // less than ~200 chars total, it's almost certainly a scanned/image PDF.
    if (text.length < 200) {
      console.log(`[parser] PDF text-layer extraction yielded ${text.length} chars — falling back to Gemini Vision`);
      try {
        return await extractWithVision(buffer, "application/pdf");
      } catch (visionErr) {
        console.error("[parser] Vision fallback failed:", visionErr);
        // Return whatever officeparser got, even if short — better than nothing
        return text;
      }
    }

    return text;
  }

  // Office formats (docx, xlsx, pptx): officeparser
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(buffer);
  return ast.toText();
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
