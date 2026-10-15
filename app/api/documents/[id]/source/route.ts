import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEmailText, type EmailHeaders } from "@/lib/sources/email";

// Everything the source viewer needs to show a document as what it is — an
// email with its sender and original HTML, a web page with a link back, or
// formatted text — in one request. The stored text keeps its line breaks,
// unlike the stitched chunks /content returns.

const TEXT_TYPES = new Set(["txt", "md", "csv"]);
const DOCX_TYPES = new Set(["docx", "doc"]);
const MAX_TEXT_BYTES = 400 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;

type SourceKind = "pdf" | "docx" | "image" | "email" | "website" | "text";

interface EmailMeta {
  from?: string | null;
  to?: string[] | string | null;
  cc?: string[] | string | null;
  reply_to?: string[] | string | null;
  date?: string | null;
  subject?: string | null;
  html_path?: string | null;
}

function joinAddresses(value: string[] | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const joined = list.map((v) => v.trim()).filter(Boolean).join(", ");
  return joined || undefined;
}

/** Drop empty fields so a spread doesn't overwrite a real value with nothing. */
function compact(headers: EmailHeaders): EmailHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([, v]) => typeof v === "string" && v.trim())
  ) as EmailHeaders;
}

async function downloadText(path: string, maxBytes: number): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").download(path);
  if (error || !data) return null;
  const blob = data.size > maxBytes ? data.slice(0, maxBytes) : data;
  return await blob.text();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // RLS decides access; "*" so this still works before migration 040 adds
  // email_meta.
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fileType = String(doc.file_type ?? "").toLowerCase();
  const source = doc.source as string | null;
  const meta = (doc.email_meta ?? null) as EmailMeta | null;

  const isEmail = (source === "email" && fileType === "txt") || fileType === "eml";
  const kind: SourceKind = isEmail
    ? "email"
    : fileType === "pdf" || doc.pdf_url
      ? "pdf"
      : DOCX_TYPES.has(fileType)
        ? "docx"
        : fileType.startsWith("image")
          ? "image"
          : source === "website"
            ? "website"
            : "text";

  let rawText: string | null = null;
  const textPath =
    (doc.text_url as string | null) ||
    (TEXT_TYPES.has(fileType) ? (doc.file_url as string | null) : null);
  if (textPath && kind !== "image") {
    try {
      rawText = await downloadText(textPath, MAX_TEXT_BYTES);
    } catch (err) {
      console.warn(`[source] Text download failed for ${id}:`, err);
    }
  }

  let email: { headers: EmailHeaders; html: string | null } | null = null;
  if (kind === "email") {
    const parsed = rawText ? parseEmailText(rawText).headers : {};
    const description = (doc.description as string | null) ?? "";
    const fallbacks: EmailHeaders = {
      from: /^Emailed by (.+)$/i.exec(description)?.[1]?.trim(),
      date: doc.created_at as string,
      subject: doc.title as string,
    };
    const fromMeta: EmailHeaders = meta
      ? {
          from: meta.from ?? undefined,
          to: joinAddresses(meta.to),
          cc: joinAddresses(meta.cc),
          date: meta.date ?? undefined,
          subject: meta.subject ?? undefined,
        }
      : {};

    let html: string | null = null;
    if (meta?.html_path) {
      try {
        html = await downloadText(meta.html_path, MAX_HTML_BYTES);
      } catch (err) {
        console.warn(`[source] Email HTML download failed for ${id}:`, err);
      }
    }

    email = {
      headers: { ...compact(fallbacks), ...compact(parsed), ...compact(fromMeta) },
      html,
    };
  }

  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      file_type: doc.file_type,
      file_name: doc.file_name,
      source: source ?? "upload",
      source_url: doc.source_url ?? null,
      description: doc.description ?? null,
      created_at: doc.created_at,
      has_original: !!doc.file_url,
    },
    kind,
    rawText,
    email,
  });
}
