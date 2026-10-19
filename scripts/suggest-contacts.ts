/**
 * Suggest staff contacts for a school from its ready documents — the same
 * scan as Admin > Settings > Contacts > "Suggest contacts from documents"
 * (lib/contacts/suggest.ts). Only contacts whose email or phone appears
 * verbatim in a document are kept, and ones already in the directory (any
 * status) are skipped.
 *
 * Usage:
 *   npx tsx scripts/suggest-contacts.ts <school-id>           # dry run: print only
 *   npx tsx scripts/suggest-contacts.ts <school-id> --write   # insert as 'suggested'
 *
 * Needs migration 044_school_contacts.sql applied. Suggestions still need an
 * admin's approval before parents see them.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

import { createAdminClient } from "@/lib/supabase/admin";
import { suggestContactsFromDocuments } from "@/lib/contacts/suggest";

async function main() {
  const schoolId = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const write = process.argv.includes("--write");
  if (!schoolId || !/^[0-9a-f-]{36}$/i.test(schoolId)) {
    console.error("Usage: tsx scripts/suggest-contacts.ts <school-id> [--write]");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const { data: school, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", schoolId)
    .maybeSingle();
  if (error || !school) {
    console.error("School not found:", error?.message ?? schoolId);
    process.exit(1);
  }

  console.log(`${write ? "WRITE" : "DRY RUN"} — ${school.name} (${school.id})`);
  const result = await suggestContactsFromDocuments(supabase, schoolId, { write });
  if (result.error) {
    console.error("Failed:", result.error);
    process.exit(1);
  }

  console.log(
    `Scanned ${result.documentsScanned} documents with contact details; ${result.found} verified contacts, ${result.suggestions.length} new.`
  );
  for (const s of result.suggestions) {
    console.log(
      `\n- ${s.name || "(no name)"} — ${s.role || "(no role)"}\n  email: ${s.email ?? "-"}  phone: ${s.phone ?? "-"}\n  topics: ${s.topics.join(", ") || "-"}\n  from: ${s.document_title} (${s.source_document_id})${s.excerpt ? `\n  "${s.excerpt.replace(/\s+/g, " ").slice(0, 200)}"` : ""}`
    );
  }
  console.log(
    write
      ? `\nInserted ${result.inserted} suggestion(s). Review them in Admin > Settings > Contacts.`
      : "\nDry run — nothing written. Re-run with --write to insert these as suggestions."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
