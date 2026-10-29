import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolContext } from "@/lib/school-context";
import { StatsCards } from "@/components/admin/stats-cards";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { PageTransition } from "@/components/motion";
import { loadDocumentMetrics, loadHeadlineMetrics } from "@/lib/metrics/load";

interface PendingRow {
  user_id: string;
  profiles:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
}

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school, role, isSuperAdmin } = await requireSchoolContext(slug);
  if (role !== "admin" && !isSuperAdmin) redirect(`/s/${slug}/parent/chat`);

  const supabase = await createClient();
  // analytics_events holds parents' question text, so school admins can't read
  // it through RLS (migration 031). The shared metrics (lib/metrics) read with
  // the service role, after the admin check above, and return counts only.
  const service = createAdminClient();

  const [metrics, documents, { data: recentDocs }, { data: pendingRows }] = await Promise.all([
    loadHeadlineMetrics(service, { schoolId: school.id, range: "7d" }),
    loadDocumentMetrics(service, school.id),
    supabase
      .from("documents")
      .select("id, title, status, created_at")
      .eq("school_id", school.id)
      .order("created_at", { ascending: false })
      .limit(5),
    // Approval is per school (school_memberships.approved), the same rows
    // the "pending" count above is taken from.
    supabase
      .from("school_memberships")
      .select("user_id, created_at, profiles!inner(full_name, email)")
      .eq("school_id", school.id)
      .eq("role", "parent")
      .eq("approved", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const pendingUsers = ((pendingRows ?? []) as unknown as PendingRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { id: row.user_id, full_name: profile?.full_name ?? null, email: profile?.email ?? null };
  });

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

      <StatsCards metrics={metrics} documents={documents} analyticsHref={`/s/${slug}/admin/analytics`} />

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
        <section id="pending-approvals" className="scroll-mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Pending Approvals</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/s/${slug}/admin/users`}>
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {pendingUsers.length > 0 ? (
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
