/** @deprecated Use getDocumentSignedUrl instead — bucket is private */
export function getDocumentPublicUrl(fileUrl: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${fileUrl}`;
}

export async function getDocumentSignedUrl(documentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/documents/${documentId}/url`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export async function getDocumentUrls(documentId: string): Promise<{
  downloadUrl: string | null;
  viewUrl: string | null;
  hasPdf: boolean;
}> {
  try {
    const res = await fetch(`/api/documents/${documentId}/url`);
    if (!res.ok) return { downloadUrl: null, viewUrl: null, hasPdf: false };
    const data = await res.json();
    return {
      downloadUrl: data.url || null,
      viewUrl: data.viewUrl || data.url || null,
      hasPdf: !!data.hasPdf,
    };
  } catch {
    return { downloadUrl: null, viewUrl: null, hasPdf: false };
  }
}
