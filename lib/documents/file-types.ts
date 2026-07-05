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
