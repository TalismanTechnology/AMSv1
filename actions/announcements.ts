"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export async function createAnnouncement(schoolId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const priority = formData.get("priority") as string;
  const pinned = formData.get("pinned") === "true";
  const indefinite = formData.get("indefinite") === "true";
  const expires_at = formData.get("expires_at") as string;

  const publishMode = formData.get("publish_mode") as string;
  const publishAt = formData.get("publish_at") as string;

  if (!title || !content) return { error: "Title and content are required" };

  // Default to 1 week from now unless indefinite or explicit date
  let resolvedExpiry: string | null = null;
  if (!indefinite) {
    if (expires_at) {
      resolvedExpiry = expires_at;
    } else {
      const oneWeek = new Date();
      oneWeek.setDate(oneWeek.getDate() + 7);
      resolvedExpiry = oneWeek.toISOString();
    }
  }

  const isScheduled = publishMode === "scheduled" && publishAt;
  const status = isScheduled ? "scheduled" : "published";

  const { data: ann, error } = await supabase
    .from("announcements")
    .insert({
      title,
      content,
      priority: priority || "normal",
      pinned,
      expires_at: resolvedExpiry,
      created_by: user.id,
      status,
      publish_at: isScheduled ? new Date(publishAt).toISOString() : null,
      school_id: schoolId,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  logAudit(user.id, "create_announcement", "announcement", ann.id, { title, status }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateAnnouncement(
  id: string,
  schoolId: string,
  data: {
    title?: string;
    content?: string;
    priority?: string;
    pinned?: boolean;
    expires_at?: string | null;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("announcements")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "update_announcement", "announcement", id, data, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAnnouncement(id: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "delete_announcement", "announcement", id, undefined, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function dismissAnnouncement(announcementId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("announcement_dismissals")
    .upsert({ user_id: user.id, announcement_id: announcementId });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}
