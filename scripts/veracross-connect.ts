// Stores a school's Veracross OAuth Application credentials (encrypted) and,
// optionally, switches the school's parent sign-in to Veracross.
//
//   VERACROSS_CLIENT_SECRET=... npx tsx scripts/veracross-connect.ts \
//     --school <askmyschool-slug> --route <veracross-school-route> \
//     --client-id <client id> [--scopes "sso"] [--parent-roles "Parent"] \
//     [--data-api] [--activate]
//
//   npx tsx scripts/veracross-connect.ts --school <slug> --deactivate
//
// The secret is read from the environment, not a flag, so it stays out of
// shell history. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// BLACKBAUD_TOKEN_ENC_KEY (the same key the app uses) in env or .env.local.
// Requires migration 034. See docs/VERACROSS.md.

import { readFileSync } from "fs";
import { resolve } from "path";
import { parseArgs } from "util";

const envPath = resolve(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
} catch {
  // Env may come from the shell instead.
}

async function main() {
  const { values } = parseArgs({
    options: {
      school: { type: "string" },
      route: { type: "string" },
      "client-id": { type: "string" },
      scopes: { type: "string" },
      "parent-roles": { type: "string" },
      "data-api": { type: "boolean", default: false },
      activate: { type: "boolean", default: false },
      deactivate: { type: "boolean", default: false },
    },
  });

  if (!values.school) throw new Error("--school <slug> is required");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { buildConnectionRow } = await import("@/lib/veracross/connection");
  const admin = createAdminClient();

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("id, name, slug")
    .eq("slug", values.school.toLowerCase())
    .single();
  if (schoolError || !school) throw new Error(`School "${values.school}" not found`);

  if (values.deactivate) {
    // Back to Blackbaud; the stored credentials are kept but disabled.
    const { error } = await admin.from("schools").update({ auth_provider: "blackbaud" }).eq("id", school.id);
    if (error) throw new Error(error.message);
    await admin.from("veracross_connections").update({ enabled: false }).eq("school_id", school.id);
    console.log(`${school.name}: parent sign-in switched back to Blackbaud.`);
    return;
  }

  const clientSecret = process.env.VERACROSS_CLIENT_SECRET;
  if (!values.route || !values["client-id"] || !clientSecret) {
    throw new Error("--route, --client-id and VERACROSS_CLIENT_SECRET are required");
  }

  const row = buildConnectionRow({
    schoolId: school.id,
    schoolRoute: values.route,
    clientId: values["client-id"],
    clientSecret,
    scopes: values.scopes,
    parentRoles: values["parent-roles"]?.split(","),
    dataApiEnabled: values["data-api"],
  });

  const { error } = await admin
    .from("veracross_connections")
    .upsert(row, { onConflict: "school_id" });
  if (error) throw new Error(`Could not save Veracross connection: ${error.message}`);
  console.log(`${school.name}: Veracross credentials saved for route "${row.school_route}".`);

  if (values.activate) {
    const { error: switchError } = await admin
      .from("schools")
      .update({ auth_provider: "veracross" })
      .eq("id", school.id);
    if (switchError) throw new Error(switchError.message);
    console.log(`${school.name}: parents now sign in with Veracross.`);
  } else {
    console.log("Not activated yet. Re-run with --activate to switch parent sign-in.");
  }
}

main().catch((caught: unknown) => {
  console.error(caught instanceof Error ? caught.message : caught);
  process.exit(1);
});
