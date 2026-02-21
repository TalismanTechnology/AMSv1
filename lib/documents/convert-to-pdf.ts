const CONVERTIBLE_TYPES = new Set(["docx", "doc", "pptx", "ppt", "xlsx", "xls"]);

/**
 * Convert an Office document buffer to PDF using LibreOffice.
 * Returns null if the file type isn't convertible or if LibreOffice is unavailable.
 * This function is intentionally non-fatal — callers should fall back gracefully.
 */
export async function convertToPdf(
  buffer: Buffer,
  fileType: string
): Promise<Buffer | null> {
  if (!CONVERTIBLE_TYPES.has(fileType)) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const libre = require("libreoffice-convert") as {
      convert: (
        doc: Buffer,
        format: string,
        filter: undefined,
        callback: (err: Error | null, result: Buffer) => void
      ) => void;
    };

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      libre.convert(buffer, ".pdf", undefined, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    return pdfBuffer;
  } catch (err) {
    console.warn(
      `[convert-to-pdf] Conversion failed for ${fileType} (is LibreOffice installed?):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
