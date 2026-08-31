import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Seeds a fake Blackbaud roster so the parent verification flow can be tested
// without a connected Blackbaud environment.
//
//   npx tsx scripts/seed-blackbaud-roster.ts <school-slug> [email ...]
//
// Writes the same rows syncRoster() would, so nothing downstream can tell the
// difference. Safe to re-run; rows are upserted by (school_id, bb_user_id).

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const DEFAULT_PARENTS = [
  { email: "parent.one@example.com", first: "Alex", last: "Rivera" },
  { email: "parent.two@example.com", first: "Jordan", last: "Chen" },
  { email: "parent.three@example.com", first: "Sam", last: "Okafor" },
];

async function main() {
  const [slug, ...emails] = process.argv.slice(2);

  if (!slug) {
    console.error(
      "Usage: npx tsx scripts/seed-blackbaud-roster.ts <school-slug> [email ...]"
    );
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: school } = await supabase
    .from("schools")
    .select("id, name, blackbaud_verification_enabled")
    .eq("slug", slug)
    .maybeSingle();

  if (!school) {
    console.error(`No school with slug "${slug}"`);
    process.exit(1);
  }

  const parents =
    emails.length > 0
      ? emails.map((email, index) => ({
          email,
          first: `Test${index + 1}`,
          last: "Parent",
        }))
      : DEFAULT_PARENTS;

  const rows = parents.map((parent, index) => ({
    school_id: school.id,
    bb_user_id: `seed-${index + 1}`,
    email: parent.email.trim().toLowerCase(),
    first_name: parent.first,
    last_name: parent.last,
    roles: ["seed-parent"],
    is_active: true,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("blackbaud_roster")
    .upsert(rows, { onConflict: "school_id,bb_user_id" });

  if (error) {
    console.error(`Seed failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} roster rows for ${school.name} (${slug}):`);
  for (const row of rows) console.log(`  ${row.email}`);

  if (!school.blackbaud_verification_enabled) {
    console.log(
      `\nNOTE: blackbaud_verification_enabled is FALSE for this school.\n` +
        `The verify endpoint will return the generic response for every email\n` +
        `until it is turned on:\n\n` +
        `  update schools set blackbaud_verification_enabled = true where slug = '${slug}';`
    );
  }
}

main();
