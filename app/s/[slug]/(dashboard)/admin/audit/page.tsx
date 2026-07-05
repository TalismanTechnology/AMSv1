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
import { formatDistanceToNow } from "date-fns";
import { ScrollText } from "lucide-react";

export default async function AuditLogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_log")
    .select("*, profiles:admin_id(full_name, email)")
    .eq("school_id", school.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="p-4 md:p-6 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
          Audit Log
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          A running record of every administrative action taken across your
          school workspace.
        </p>
      </header>

      <section>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium text-muted-foreground">
                Admin
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">
                Action
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">
                Entity
              </TableHead>
              <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                When
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!logs || logs.length === 0) ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <ScrollText className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium text-ink">
                      Nothing logged yet
                    </p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Admin activity will appear here as changes are made.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const admin = log.profiles as unknown as {
                  full_name: string | null;
                  email: string;
                } | null;
                return (
                  <TableRow
                    key={log.id}
                    className="border-border transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="py-4 text-sm font-medium text-ink">
                      {admin?.full_name || admin?.email || "System"}
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className="text-xs font-medium">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id && (
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          ({log.entity_id.slice(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
