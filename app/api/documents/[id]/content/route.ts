import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const content = (chunks || []).map((c) => c.content).join("\n\n");

  return NextResponse.json({
    document: doc,
    content,
    chunkCount: chunks?.length || 0,
  });
}
