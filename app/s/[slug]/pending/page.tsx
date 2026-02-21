import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchoolBySlug, getUserSchools } from "@/lib/school-context";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { GradientMesh } from "@/components/ui/gradient-mesh";
import { Clock, ArrowLeft } from "lucide-react";
import { logout } from "@/actions/auth";

export default async function PendingApprovalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's other approved schools so they can navigate back
  let otherSchools: { slug: string; name: string; role: string }[] = [];
  if (user) {
    const memberships = await getUserSchools(user.id);
    otherSchools = memberships
      .filter((m) => m.school_id !== school.id && m.approved && m.school)
      .map((m) => ({
        slug: m.school!.slug,
        name: m.school!.name,
        role: m.role,
      }));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <GradientMesh />
      <div className="relative z-10 text-center space-y-8 max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
          <Clock className="h-8 w-8 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold metallic-heading">
            Pending Approval
          </h1>
          <p className="text-muted-foreground">
            Your request to join <strong>{school.name}</strong> is pending review.
            A school administrator will approve your access.
          </p>
        </div>

        <div className="flex flex-col gap-3 items-center">
          {otherSchools.length > 0 && (
            <div className="space-y-2 w-full">
              <p className="text-sm text-muted-foreground">Your other schools:</p>
              {otherSchools.map((s) => (
                <Button key={s.slug} asChild variant="outline" className="w-full">
                  <Link href={`/s/${s.slug}/${s.role === "admin" ? "admin" : "parent"}`}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {s.name}
                  </Link>
                </Button>
              ))}
            </div>
          )}

          <form action={logout} className="w-full">
            <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
