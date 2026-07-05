import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { StatsCards } from "@/components/admin/stats-cards";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { PageTransition } from "@/components/motion";

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
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
          {school.name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          An overview of documents, families, and the questions parents are
          asking today.
        </p>
      </header>

      <StatsCards
        totalDocuments={totalDocuments || 0}
        readyDocuments={readyDocuments || 0}
        totalParents={totalParents || 0}
        pendingParents={pendingParents || 0}
        questionsToday={questionsToday || 0}
        questionsTotal={questionsTotal || 0}
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {/* Recent Documents */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Documents</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/s/${slug}/admin/documents`}>
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {recentDocs && recentDocs.length > 0 ? (
            <div className="divide-y divide-border">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
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
            <div className="py-8">
              <p className="text-sm font-medium text-ink">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Uploaded documents will appear in this space.
              </p>
            </div>
          )}
        </section>

        {/* Pending Approvals */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Pending Approvals</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/s/${slug}/admin/users`}>
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {pendingUsers && pendingUsers.length > 0 ? (
            <div className="divide-y divide-border">
              {pendingUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {user.full_name || "Unnamed"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8">
              <p className="text-sm font-medium text-ink">All caught up</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No families are waiting for approval.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
    </PageTransition>
  );
}
