import type { UserRole } from "@/lib/types";

// A parent with no children on file gets asked to add them: on first run via
// the /welcome step, and on later visits via a prompt in the parent area.
// "Skip for now" sets this cookie for the rest of the browser session (no
// expiry), so the prompt comes back next session while they still have none.
export const CHILDREN_PROMPT_SKIP_COOKIE = "ams_children_prompt_skipped";

export interface ChildrenPromptInput {
  role: UserRole;
  isSuperAdmin: boolean;
  /** Children on file for this parent at this school. */
  childCount: number;
  /** Whether "Skip for now" was pressed earlier this session. */
  skippedThisSession: boolean;
}

export function shouldPromptForChildren({
  role,
  isSuperAdmin,
  childCount,
  skippedThisSession,
}: ChildrenPromptInput): boolean {
  if (isSuperAdmin || role !== "parent") return false;
  if (childCount > 0) return false;
  return !skippedThisSession;
}
