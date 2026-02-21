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
import { MagicBentoCard } from "@/components/magic-bento";

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
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold metallic-heading">Audit Log</h1>

      <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="hidden md:table-cell">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!logs || logs.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No audit events yet
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const admin = log.profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  } | null;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {admin?.full_name || admin?.email || "System"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.entity_type}
                        {log.entity_id && (
                          <span className="ml-1 text-xs">
                            ({log.entity_id.slice(0, 8)}...)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
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
        </div>
      </MagicBentoCard>
    </div>
  );
}
