import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stitchChunks } from "@/lib/ai/stitch";

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

  // Fetch document metadata
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, file_type, file_name, file_url")
    .eq("id", id)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all chunks ordered by index (RLS enforces access)
  const { data: chunks } = await supabase
    .from("document_chunks")
    .select("content, chunk_index")
    .eq("document_id", id)
    .order("chunk_index", { ascending: true });

  // Stitched exactly as cited passages are, so a passage is a literal
  // substring of this text and the sidebar highlights it precisely. A plain
  // join would repeat every overlap and break the match at each seam.
  const content = stitchChunks(chunks || []);

  return NextResponse.json({
    document: doc,
    content,
    chunkCount: chunks?.length || 0,
  });
}
