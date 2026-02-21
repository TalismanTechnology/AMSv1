import { createAdminClient } from "@/lib/supabase/admin";

export function logAudit(
  adminId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>,
  schoolId?: string
) {
  const supabase = createAdminClient();
  supabase
    .from("audit_log")
    .insert({
      admin_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
      school_id: schoolId || null,
    })
    .then();
}
