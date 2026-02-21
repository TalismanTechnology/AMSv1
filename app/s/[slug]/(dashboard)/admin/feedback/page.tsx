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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";
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
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold metallic-heading">Feedback & Review</h1>

      <MagicBentoGrid className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Ratings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{total}</p>
            </CardContent>
          </Card>
        </MagicBentoCard>
        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Positive Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-green-500">{positiveRate}%</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5 text-green-500">
                    <ThumbsUp className="h-3 w-3" /> {totalUp}
                  </span>
                  <span className="flex items-center gap-0.5 text-red-500">
                    <ThumbsDown className="h-3 w-3" /> {totalDown}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>
        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Thumbs Down
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-500">{thumbsDownFeedback.length}</p>
            </CardContent>
          </Card>
        </MagicBentoCard>
        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Unanswered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-500">{unansweredCount}</p>
            </CardContent>
          </Card>
        </MagicBentoCard>
      </MagicBentoGrid>

      {/* Thumbs Down Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ThumbsDown className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold">Negative Feedback</h2>
          <Badge variant="secondary">{thumbsDownFeedback.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Messages where users indicated the response was not helpful.
        </p>
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead className="hidden md:table-cell">User</TableHead>
                  <TableHead className="hidden md:table-cell">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thumbsDownFeedback.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground py-8"
                    >
                      No negative feedback yet
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
                      <TableRow key={f.id}>
                        <TableCell className="max-w-md">
                          <p className="text-sm truncate">
                            {message?.content?.slice(0, 120) || "\u2014"}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {user?.full_name || user?.email || "Unknown"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
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
        </MagicBentoCard>
      </div>

      {/* Unanswered Questions Section */}
      <UnansweredQuestionsSection groups={unansweredGroups} schoolId={school.id} />
    </div>
  );
}
