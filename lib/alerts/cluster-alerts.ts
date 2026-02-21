import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { labelClusters } from "@/lib/ai/label-clusters";

/**
 * Send in-app + email alerts to all school admins when a question cluster
 * crosses the alert threshold. Uses optimistic concurrency (alert_sent_at IS NULL)
 * to prevent duplicate alerts from race conditions.
 */
export async function sendClusterAlert(
  adminSupabase: SupabaseClient,
  clusterId: string,
  schoolId: string
): Promise<void> {
  // 1. Mark alert as sent (optimistic lock — prevents duplicates)
  const { data: updated, error: lockError } = await adminSupabase
    .from("unanswered_clusters")
    .update({ alert_sent_at: new Date().toISOString() })
    .eq("id", clusterId)
    .is("alert_sent_at", null)
    .select("id, label, question_count")
    .single();

  if (lockError || !updated) {
    // Another process already sent the alert
    return;
  }

  // 2. Get cluster label (generate if missing)
  let label = updated.label;
  if (!label) {
    const { data: questions } = await adminSupabase
      .from("unanswered_questions")
      .select("id, question, embedding, created_at")
      .eq("cluster_id", clusterId)
      .limit(10);

    if (questions && questions.length > 0) {
      const parsed = questions.map((q) => ({
        ...q,
        embedding:
          typeof q.embedding === "string"
            ? JSON.parse(q.embedding)
            : q.embedding,
      }));

      try {
        const labeled = await labelClusters([{ questions: parsed }]);
        label = labeled[0]?.label || questions[0].question;
      } catch {
        label = questions[0].question;
      }

      // Persist the label
      await adminSupabase
        .from("unanswered_clusters")
        .update({ label })
        .eq("id", clusterId);
    } else {
      label = "Unanswered questions";
    }
  }

  // 3. Get sample questions for the alert body
  const { data: sampleQuestions } = await adminSupabase
    .from("unanswered_questions")
    .select("question")
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: false })
    .limit(3);

  const sampleList =
    sampleQuestions?.map((q) => q.question).join("; ") || "";

  // 4. Get school slug for links
  const { data: school } = await adminSupabase
    .from("schools")
    .select("slug, name")
    .eq("id", schoolId)
    .single();

  const slug = school?.slug || schoolId;
  const schoolName = school?.name || "Your school";
  const feedbackLink = `/s/${slug}/admin/feedback`;

  // 5. Get all admin users for this school
  const { data: admins } = await adminSupabase
    .from("school_memberships")
    .select("user_id, profiles(email)")
    .eq("school_id", schoolId)
    .eq("role", "admin");

  if (!admins || admins.length === 0) return;

  // 6. Create in-app notifications for each admin
  const notifications = admins.map((admin) => ({
    user_id: admin.user_id,
    school_id: schoolId,
    type: "cluster_alert" as const,
    title: `${updated.question_count}+ students asking about "${label}"`,
    body: `A knowledge gap has been detected. Sample questions: ${sampleList}`,
    link: feedbackLink,
  }));

  await adminSupabase.from("notifications").insert(notifications);

  // 7. Send email to each admin
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const adminEmails = admins
    .map((a) => {
      const profile = a.profiles as unknown as { email: string } | null;
      return profile?.email;
    })
    .filter(Boolean) as string[];

  if (adminEmails.length > 0) {
    const html = buildAlertEmail({
      schoolName,
      label: label!,
      questionCount: updated.question_count,
      sampleQuestions: sampleQuestions?.map((q) => q.question) || [],
      feedbackUrl: `${baseUrl}${feedbackLink}`,
    });

    await sendEmail(
      adminEmails,
      `Knowledge gap detected: "${label}" (${updated.question_count} questions)`,
      html
    );
  }
}

function buildAlertEmail(opts: {
  schoolName: string;
  label: string;
  questionCount: number;
  sampleQuestions: string[];
  feedbackUrl: string;
}): string {
  const questionsHtml = opts.sampleQuestions
    .map((q) => `<li style="margin-bottom:4px">${escapeHtml(q)}</li>`)
    .join("");

  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a1a1a">Knowledge Gap Alert</h2>
  <p><strong>${opts.questionCount} students</strong> have asked about
    <strong>"${escapeHtml(opts.label)}"</strong> at ${escapeHtml(opts.schoolName)},
    but the chatbot couldn't find an answer.</p>
  <h3 style="color:#555;font-size:14px">Sample questions:</h3>
  <ul style="color:#333;font-size:14px">${questionsHtml}</ul>
  <p>
    <a href="${opts.feedbackUrl}"
       style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
      Review &amp; Respond
    </a>
  </p>
  <p style="color:#999;font-size:12px;margin-top:24px">
    You're receiving this because you're an admin at ${escapeHtml(opts.schoolName)}.
  </p>
</body>
</html>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
