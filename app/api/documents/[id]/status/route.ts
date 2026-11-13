import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { schoolLockError } from "@/lib/school-lock/access";

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

  const { data, error } = await supabase
    .from("documents")
    .select("id, school_id, status, summary, error_message, page_count, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The school's owner lock (only ever affects a super-admin).
  const locked = await schoolLockError(data.school_id, "member", user.id);
  if (locked) return NextResponse.json({ error: locked }, { status: 423 });

  return NextResponse.json({
    id: data.id,
    status: data.status,
    summary: data.summary,
    error_message: data.error_message,
    page_count: data.page_count,
    updated_at: data.updated_at,
  });
}
