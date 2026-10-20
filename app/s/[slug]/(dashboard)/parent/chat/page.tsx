import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ChatPageClient } from "./chat-page-client";
import { hasAiConsent } from "@/lib/ai/consent";
import { loadCurrentChat } from "@/lib/chat/current-chat";
import { parentChatHeading } from "@/lib/chat/chat-view";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // The parent's one chat (last 30 minutes), loaded before the chat input
  // mounts so they can never send into a chat whose history isn't shown.
  const chatPromise = loadCurrentChat(user.id, school.id);

  // Whether to show the one-time AI-processing notice before the first
  // question (the chat API enforces it too).
  const consentPromise = supabase
    .from("profiles")
    .select("ai_consent_at, ai_consent_version")
    .eq("id", user.id)
    .single();

  // Load suggested questions from settings (fallback to empty)
  const settingsPromise = supabase
    .from("settings")
    .select("suggested_questions, welcome_message")
    .eq("school_id", school.id)
    .single();

  const [chat, { data: consent }, { data: settings }] = await Promise.all([
    chatPromise,
    consentPromise,
    settingsPromise,
  ]);

  const suggestedQuestions =
    settings?.suggested_questions && Array.isArray(settings.suggested_questions)
      ? (settings.suggested_questions as string[])
      : undefined;

  return (
    <Suspense>
      <ChatPageClient
        session={chat.session}
        messages={chat.messages}
        suggestedQuestions={
          suggestedQuestions && suggestedQuestions.length > 0
            ? suggestedQuestions
            : undefined
        }
        welcomeMessage={settings?.welcome_message}
        schoolId={school.id}
        heading={parentChatHeading(school.name)}
        aiConsentGiven={hasAiConsent(consent)}
      />
    </Suspense>
  );
}
