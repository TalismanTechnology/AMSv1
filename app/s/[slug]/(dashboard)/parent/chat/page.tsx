import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ChatPageClient } from "./chat-page-client";
import { hasAiConsent } from "@/lib/ai/consent";
import { loadChatPage } from "@/lib/chat/current-chat";
import { parentChatHeading } from "@/lib/chat/chat-view";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ chat?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const requestedChat = typeof query.chat === "string" ? query.chat : null;
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // The parent's chat list, plus the chat ?chat=<id> names (with its
  // messages, loaded before the chat input mounts so they can never send into
  // a chat whose history isn't shown). Otherwise the page opens a new chat.
  const chatPromise = loadChatPage(user.id, school.id, requestedChat);

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
        chats={chat.chats}
        openChat={chat.open}
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
