import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Fetch document — RLS ensures user has access via school membership
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_url, pdf_url")
    .eq("id", id)
    .single();

  if (!doc || !doc.file_url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Generate signed URL for the best viewable version (PDF when available)
  const viewPath = doc.pdf_url || doc.file_url;
  const { data: viewData, error: viewError } = await admin.storage
    .from("documents")
    .createSignedUrl(viewPath, 3600);

  if (viewError || !viewData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate URL" },
      { status: 500 }
    );
  }

  // If there's a converted PDF, also return the original URL for download
  let downloadUrl: string | undefined;
  if (doc.pdf_url) {
    const { data: dlData } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 3600);
    downloadUrl = dlData?.signedUrl;
  }

  return NextResponse.json({
    url: downloadUrl || viewData.signedUrl, // backwards compat: original file for download
    viewUrl: viewData.signedUrl,            // best version for viewing
    hasPdf: !!doc.pdf_url,
  });
}
