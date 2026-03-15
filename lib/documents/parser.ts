import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  // Plain text: no parsing needed
  if (fileType === "txt") {
    return buffer.toString("utf-8");
  }

  // Images: use Gemini Vision for OCR
  if (fileType === "image") {
    const base64 = buffer.toString("base64");
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: base64,
              mediaType: "image/png",
            },
            {
              type: "text",
              text: "Extract ALL visible text from this image. Return only the extracted text, preserving the original structure and formatting as much as possible. If there is no text, describe the image content in detail so it can be searched.",
            },
          ],
        },
      ],
      maxOutputTokens: 4096,
      temperature: 0,
    });
    return text.trim();
  }

  // All other supported types (pdf, docx, xlsx, pptx) — officeparser handles them all
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(buffer);
  return ast.toText();
}
