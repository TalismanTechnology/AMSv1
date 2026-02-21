export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  // Plain text: no parsing needed
  if (fileType === "txt") {
    return buffer.toString("utf-8");
  }

  // All other supported types (pdf, docx, xlsx, pptx) — officeparser handles them all
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(buffer);
  return ast.toText();
}
