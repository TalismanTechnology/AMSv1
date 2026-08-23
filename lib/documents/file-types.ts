// Shared file-type mapping for document ingestion (upload + email).

export const BLOCKED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
];

export const TYPE_MAP: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  txt: "txt",
  // Saved email messages. Must map explicitly: the "txt" default would send raw
  // RFC822 source — MIME boundaries, encoded headers, base64 attachment blobs —
  // straight into the embedding index.
  eml: "eml",
};

/**
 * MIME types accepted by the upload dropzone, keyed by MIME with the extensions
 * each one covers. Lives here so the browser allowlist and the server-side type
 * mapping can't drift apart.
 */
export const ACCEPTED_UPLOAD_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt"],
  // Browsers are inconsistent about the MIME they report for .eml, so accept
  // the extension under both the standard type and a wildcard fallback.
  "message/rfc822": [".eml"],
  "application/octet-stream": [".eml"],
};

export function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isBlockedFile(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.includes(extensionOf(fileName));
}

/** Maps a filename to an internal file_type; defaults to "txt". */
export function fileTypeFromName(fileName: string): string {
  return TYPE_MAP[extensionOf(fileName)] || "txt";
}
