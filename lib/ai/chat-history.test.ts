import test from "node:test";
import assert from "node:assert/strict";
import { convertToModelMessages, type UIMessage } from "ai";

import { buildModelHistory, type StoredMessage } from "@/lib/chat/retention";
import { sanitizeMessages } from "./chat-turn";
import { buildSystemPrompt } from "./system-prompt";

// Regression: a parent's 3rd question was answered after re-answering the
// first two. The model must get the earlier turns as answered context —
// alternating user/assistant, the latest question last — and be told to
// answer only that question.

const at = (m: number) => new Date(Date.UTC(2026, 9, 21, 12, m)).toISOString();
const latest: UIMessage = {
  id: "client",
  role: "user",
  parts: [{ type: "text", text: "what is the current ranking for 8th grade collegiate soccer?" }],
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return (content as { type: string; text?: string }[])
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

test("stored exchanges reach the model as answered turns, latest question last", async () => {
  const stored: StoredMessage[] = [
    { id: "u1", role: "user", content: "when are finals", created_at: at(0) },
    { id: "a1", role: "assistant", content: "Finals are June 2-5 [1].", created_at: at(1) },
    { id: "u2", role: "user", content: "what are the dress down days?", created_at: at(2) },
    { id: "a2", role: "assistant", content: "Dress down days are Fridays [2].", created_at: at(3) },
  ];
  // Newest first, as the route reads them.
  const history = buildModelHistory([...stored].reverse(), latest);
  const model = await convertToModelMessages(sanitizeMessages(history as UIMessage[]));

  assert.deepEqual(
    model.map((m) => m.role),
    ["user", "assistant", "user", "assistant", "user"]
  );
  assert.equal(textOf(model[1].content), "Finals are June 2-5.");
  assert.match(textOf(model[4].content), /soccer/);
});

test("questions whose reply was never saved don't reach the model as unanswered turns", async () => {
  const stored: StoredMessage[] = [
    { id: "u1", role: "user", content: "when are finals", created_at: at(0) },
    { id: "u2", role: "user", content: "what are the dress down days?", created_at: at(2) },
  ];
  const model = await convertToModelMessages(
    sanitizeMessages(buildModelHistory(stored, latest) as UIMessage[])
  );
  assert.deepEqual(model.map((m) => m.role), ["user"]);
  assert.match(textOf(model[0].content), /soccer/);
});

test("with earlier turns, the system prompt says to answer only the latest message", () => {
  const withHistory = buildSystemPrompt([], { hasHistory: true });
  assert.match(withHistory, /Answer only the parent's latest message/);
  assert.match(withHistory, /re-answer earlier questions/);
  // The output format stays last.
  assert.ok(withHistory.indexOf("CONVERSATION") < withHistory.indexOf("FOLLOW-UP QUESTIONS"));

  assert.doesNotMatch(buildSystemPrompt([]), /CONVERSATION/);
});
