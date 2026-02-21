import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { StatsCards } from "@/components/admin/stats-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { PageTransition } from "@/components/motion";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { count: totalDocuments },
    { count: readyDocuments },
    { count: totalParents },
    { count: pendingParents },
    { count: questionsToday },
    { count: questionsTotal },
    { data: recentDocs },
    { data: pendingUsers },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school.id),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school.id)
      .eq("status", "ready"),
    supabase
      .from("profiles")
      .select("*, school_memberships!inner(school_id)", { count: "exact", head: true })
      .eq("school_memberships.school_id", school.id)
      .eq("role", "parent"),
    supabase
      .from("profiles")
      .select("*, school_memberships!inner(school_id)", { count: "exact", head: true })
      .eq("school_memberships.school_id", school.id)
      .eq("role", "parent")
      .eq("approved", false),
    supabase
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school.id)
      .eq("event_type", "question")
      .gte("created_at", today.toISOString()),
    supabase
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school.id)
      .eq("event_type", "question"),
    supabase
      .from("documents")
      .select("id, title, status, created_at")
      .eq("school_id", school.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("profiles")
      .select("id, full_name, email, created_at, school_memberships!inner(school_id)")
      .eq("school_memberships.school_id", school.id)
      .eq("role", "parent")
      .eq("approved", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <PageTransition>
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Dashboard</h1>

      <StatsCards
        totalDocuments={totalDocuments || 0}
        readyDocuments={readyDocuments || 0}
        totalParents={totalParents || 0}
        pendingParents={pendingParents || 0}
        questionsToday={questionsToday || 0}
        questionsTotal={questionsTotal || 0}
      />

      <MagicBentoGrid className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Recent Documents */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Documents</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/s/${slug}/admin/documents`}>
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentDocs && recentDocs.length > 0 ? (
                <div className="space-y-3">
                  {recentDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(doc.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <Badge
                        variant={
                          doc.status === "ready"
                            ? "default"
                            : doc.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                        className={
                          doc.status === "ready"
                            ? "bg-success/15 text-success"
                            : ""
                        }
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No documents yet.</p>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>

        {/* Pending Approvals */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pending Approvals</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/s/${slug}/admin/users`}>
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {pendingUsers && pendingUsers.length > 0 ? (
                <div className="space-y-3">
                  {pendingUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {user.full_name || "Unnamed"}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pending approvals.
                </p>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>
      </MagicBentoGrid>
    </div>
    </PageTransition>
  );
}
