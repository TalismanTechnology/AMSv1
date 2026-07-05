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
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getUnansweredQuestions } from "@/actions/unanswered-questions";
import { UnansweredQuestionsSection } from "./unanswered-questions";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ data: feedback }, unansweredGroups] = await Promise.all([
    supabase
      .from("chat_feedback")
      .select(
        "*, profiles:user_id(full_name, email), chat_messages:message_id(content, role)"
      )
      .eq("school_id", school.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getUnansweredQuestions(school.id),
  ]);

  const totalUp = feedback?.filter((f) => f.rating === "up").length || 0;
  const totalDown = feedback?.filter((f) => f.rating === "down").length || 0;
  const total = totalUp + totalDown;
  const positiveRate = total > 0 ? Math.round((totalUp / total) * 100) : 0;
  const thumbsDownFeedback = feedback?.filter((f) => f.rating === "down") || [];
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
          <p className="text-2xl font-semibold text-ink">
            {thumbsDownFeedback.length}
          </p>
          <p className="text-sm text-muted-foreground">Thumbs Down</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{unansweredCount}</p>
          <p className="text-sm text-muted-foreground">Unanswered</p>
        </div>
      </div>

      {/* Thumbs Down Section */}
      <div className="relative space-y-4">
        <div className="flex items-center gap-2">
          <ThumbsDown className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-ink tracking-[-0.01em]">
            Negative Feedback
          </h2>
          <Badge variant="secondary">{thumbsDownFeedback.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Messages where users indicated the response was not helpful.
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Message
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  User
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thumbsDownFeedback.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-12 text-center">
                    <ThumbsDown className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
                    <p className="text-lg font-semibold text-ink tracking-[-0.01em]">
                      No negative feedback yet
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The assistant is keeping parents happy so far.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                thumbsDownFeedback.map((f) => {
                  const user = f.profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  } | null;
                  const message = f.chat_messages as unknown as {
                    content: string;
                    role: string;
                  } | null;
                  return (
                    <TableRow key={f.id} className="transition-colors hover:bg-muted/60">
                      <TableCell className="max-w-md py-4">
                        <p className="truncate text-sm text-ink">
                          {message?.content?.slice(0, 120) || "\u2014"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                        {user?.full_name || user?.email || "Unknown"}
                      </TableCell>
                      <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                        {formatDistanceToNow(new Date(f.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })
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
