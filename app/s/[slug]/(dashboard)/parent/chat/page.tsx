import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ChatPageClient } from "./chat-page-client";
import { hasAiConsent } from "@/lib/ai/consent";
import { CHAT_HISTORY_LIMIT } from "@/lib/chat/history-retention";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("school_id", school.id)
    .eq("hidden_from_parent", false)
    .order("updated_at", { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  // Whether to show the one-time AI-processing notice before the first
  // question (the chat API enforces it too).
  const { data: consent } = await supabase
    .from("profiles")
    .select("ai_consent_at, ai_consent_version")
    .eq("id", user.id)
    .single();

  // Load suggested questions from settings (fallback to empty)
  const { data: settings } = await supabase
    .from("settings")
    .select("suggested_questions, welcome_message")
    .eq("school_id", school.id)
    .single();

  const suggestedQuestions =
    settings?.suggested_questions && Array.isArray(settings.suggested_questions)
      ? (settings.suggested_questions as string[])
      : undefined;

  return (
    <Suspense>
      <ChatPageClient
        sessions={sessions || []}
        suggestedQuestions={
          suggestedQuestions && suggestedQuestions.length > 0
            ? suggestedQuestions
            : undefined
        }
        welcomeMessage={settings?.welcome_message}
        schoolId={school.id}
        schoolSlug={slug}
        aiConsentGiven={hasAiConsent(consent)}
      />
    </Suspense>
  );
}
