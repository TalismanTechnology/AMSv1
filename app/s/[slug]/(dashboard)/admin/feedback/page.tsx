import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getUnansweredQuestions } from "@/actions/unanswered-questions";
import { UnansweredQuestionsSection } from "./unanswered-questions";

type FlagReason = "unanswered" | "unhelpful";

interface FlaggedRow {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  flag_reason: FlagReason;
}

interface FlaggedExchange {
  key: string;
  question: string | null;
  answer: string | null;
  reason: FlagReason;
  createdAt: string;
}

// Staff only ever receive flagged exchanges: RLS (migration 031) limits
// school admins to messages where the assistant couldn't answer or the parent
// gave a thumbs-down, so this pairs each flagged question with its reply.
function toExchanges(rows: FlaggedRow[]): FlaggedExchange[] {
  const sorted = [...rows].sort(
    (a, b) =>
      a.session_id.localeCompare(b.session_id) ||
      a.created_at.localeCompare(b.created_at)
  );
  const exchanges: FlaggedExchange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const next = sorted[i + 1];
    if (
      row.role === "user" &&
      next &&
      next.role === "assistant" &&
      next.session_id === row.session_id
    ) {
      exchanges.push({
        key: row.id,
        question: row.content,
        answer: next.content,
        reason: next.flag_reason === "unhelpful" || row.flag_reason === "unhelpful" ? "unhelpful" : row.flag_reason,
        createdAt: next.created_at,
      });
      i++;
    } else {
      exchanges.push({
        key: row.id,
        question: row.role === "user" ? row.content : null,
        answer: row.role === "assistant" ? row.content : null,
        reason: row.flag_reason,
        createdAt: row.created_at,
      });
    }
  }
  return exchanges.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ count: upCount }, { count: downCount }, { data: flaggedRows }, unansweredGroups] =
    await Promise.all([
      // Rating totals only (no message content).
      supabase
        .from("chat_feedback")
        .select("id", { count: "exact", head: true })
        .eq("school_id", school.id)
        .eq("rating", "up"),
      supabase
        .from("chat_feedback")
        .select("id", { count: "exact", head: true })
        .eq("school_id", school.id)
        .eq("rating", "down"),
      supabase
        .from("flagged_chat_messages")
        .select("id, session_id, role, content, created_at, flag_reason")
        .eq("school_id", school.id)
        .order("created_at", { ascending: false })
        .limit(200),
      getUnansweredQuestions(school.id),
    ]);

  const totalUp = upCount || 0;
  const totalDown = downCount || 0;
  const total = totalUp + totalDown;
  const positiveRate = total > 0 ? Math.round((totalUp / total) * 100) : 0;
  const flagged = toExchanges((flaggedRows as FlaggedRow[] | null) || []).slice(0, 50);
  const unansweredCount = unansweredGroups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="relative space-y-10 p-4 md:p-6">
      <header className="relative">
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
          Feedback &amp; Review
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How parents are responding to the assistant, and where it&apos;s
          falling short.
        </p>
      </header>

      <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <p className="text-2xl font-semibold text-ink">{total}</p>
          <p className="text-sm text-muted-foreground">Total Ratings</p>
        </div>
        <div>
          <div className="flex items-baseline gap-3">
            <p className="text-2xl font-semibold text-ink">{positiveRate}%</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5 text-green-600">
                <ThumbsUp className="h-3 w-3" /> {totalUp}
              </span>
              <span className="flex items-center gap-0.5 text-red-500">
                <ThumbsDown className="h-3 w-3" /> {totalDown}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Positive Rate</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{totalDown}</p>
          <p className="text-sm text-muted-foreground">Thumbs Down</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{unansweredCount}</p>
          <p className="text-sm text-muted-foreground">Unanswered</p>
        </div>
      </div>

      {/* Flagged conversations */}
      <div className="relative space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-ink tracking-[-0.01em]">
            Flagged Conversations
          </h2>
          <Badge variant="secondary">{flagged.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Only exchanges the assistant couldn&apos;t answer, or that a parent
          marked unhelpful, are shown here. Other conversations stay private
          to the parent.
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Exchange
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  Reason
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flagged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-12 text-center">
                    <Flag className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
                    <p className="text-lg font-semibold text-ink tracking-[-0.01em]">
                      Nothing flagged yet
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The assistant is keeping parents happy so far.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                flagged.map((x) => (
                  <TableRow key={x.key} className="transition-colors hover:bg-muted/60">
                    <TableCell className="max-w-md space-y-1 py-4">
                      {x.question && (
                        <p className="truncate text-sm font-medium text-ink">
                          Q: {x.question.slice(0, 160)}
                        </p>
                      )}
                      {x.answer && (
                        <p className="truncate text-sm text-muted-foreground">
                          A: {x.answer.slice(0, 160)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-4 md:table-cell">
                      <Badge variant={x.reason === "unhelpful" ? "destructive" : "secondary"}>
                        {x.reason === "unhelpful" ? "Marked unhelpful" : "Couldn\u2019t answer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                      {formatDistanceToNow(new Date(x.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Unanswered Questions Section */}
      <UnansweredQuestionsSection groups={unansweredGroups} schoolId={school.id} />
    </div>
  );
}
