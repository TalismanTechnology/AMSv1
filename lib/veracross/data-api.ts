import { z } from "zod";
import { GRADE_VALUES } from "@/lib/grades";
import { getVeracrossClientCredentialsToken } from "./oauth";
import type { VeracrossConnection } from "./connection";

// Veracross Data API v3: who a signed-in parent's children are, and their
// grade levels. Optional per school (veracross_connections.data_api_enabled);
// sign-in works without it and parents enter children on /welcome instead.
//
//   Base URL  https://api.veracross.com/{route}/v3/
//   Auth      Bearer token from the client_credentials grant, same OAuth app
//
// Endpoints and the scope each needs (sources retrieved 2026-10-09):
//   GET /person_accounts?username=  person_accounts:list   (username -> Person ID)
//   GET /parents/{id}               parents:read           (household_id, names)
//   GET /students?household_id=     students:list          (children + grade_level)
//   GET /relationships?person_id=   relationships:list     (children in other households)
//   GET /students/{id}              students:read
//   GET /academics/config/grade_levels   academics.config.grade_levels:list
//
//   https://api-docs.veracross.com/docs/docs/cd9d140be5811-using-the-data-api
//   https://api-docs.veracross.com/docs/docs/cb6d3965fde44-list-person-accounts
//   https://api-docs.veracross.com/docs/docs/996d9153ba64d-read-parents
//   https://api-docs.veracross.com/docs/docs/d50279dec5fd1-list-students
//   https://api-docs.veracross.com/docs/docs/726f1bf9a7d57-list-relationships
//   https://api-docs.veracross.com/docs/docs/d42a1136866ee-list-academics-configuration-grade-levels
//
// UNVERIFIED (no real tenant to test against): that userinfo's
// `preferred_username` equals person_accounts.username, and which side of a
// relationship row is the child. Everything here is best-effort; a failure is
// logged and sign-in carries on.
//
// TODO(veracross-sync): roster + calendar sync, not implemented. Plan in
// docs/VERACROSS.md ("Roster and calendar sync").

const DATA_API_ORIGIN = "https://api.veracross.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RELATIONSHIP_LOOKUPS = 8;

export const VERACROSS_DATA_SCOPES = [
  "person_accounts:list",
  "parents:read",
  "students:list",
  "students:read",
  "relationships:list",
  "academics.config.grade_levels:list",
] as const;

class NotFoundError extends Error {}

// Veracross: "currently, special characters in the query parameter values
// must not be URL encoded" (List Parents). Usernames are often emails, so
// leave `@` readable; everything else that is unsafe in a URL is encoded.
export function buildDataApiQuery(params: Record<string, string | number>): string {
  const pairs = Object.entries(params).map(
    ([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value)).replace(/%40/g, "@")}`
  );
  return pairs.length ? `?${pairs.join("&")}` : "";
}

async function dataGet(
  schoolRoute: string,
  token: string,
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const url = `${DATA_API_ORIGIN}/${schoolRoute}/v3${path}${buildDataApiQuery(params)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Page-Size": "1000",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) throw new NotFoundError(path);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Veracross ${path} failed (${response.status}): ${detail}`);
  }

  return response.json();
}

const id = z.union([z.number(), z.string()]).transform(String);

const personAccountsSchema = z.object({
  data: z.array(z.object({ person_id: id, username: z.string().nullish() })).default([]),
});

const parentSchema = z.object({
  data: z.object({ id, household_id: id.nullish() }),
});

const studentSchema = z.object({
  id,
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  preferred_name: z.string().nullish(),
  grade_level: id.nullish(),
  roles: z.string().nullish(),
});

export type VeracrossStudent = z.infer<typeof studentSchema>;

const studentsSchema = z.object({ data: z.array(studentSchema).default([]) });
const studentReadSchema = z.object({ data: studentSchema });

const relationshipsSchema = z.object({
  data: z
    .array(
      z.object({
        person_id: id,
        related_person_id: id,
        legal_custody: z.boolean().nullish(),
        parent_portal_access: z.boolean().nullish(),
        related_person_is_deceased: z.boolean().nullish(),
      })
    )
    .default([]),
});

const gradeLevelSchema = z.object({
  id,
  grade_level: z.string().nullish(),
  abbreviation: z.string().nullish(),
  long_description: z.string().nullish(),
});

export type VeracrossGradeLevel = z.infer<typeof gradeLevelSchema>;

const gradeLevelsSchema = z.object({ data: z.array(gradeLevelSchema).default([]) });

/**
 * Maps a school-defined Veracross grade level onto AskMySchool's fixed grade
 * values (lib/grades.ts). Schools name grades their own way ("Grade 5",
 * "5th Grade", "05", "Form V"...), so this tries the common spellings and
 * otherwise keeps the school's own label, which formatGrade shows as-is.
 */
export function mapVeracrossGrade(level: VeracrossGradeLevel | undefined): string | null {
  if (!level) return null;

  const candidates = [level.abbreviation, level.grade_level, level.long_description]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const raw of candidates) {
    const value = raw.toLowerCase().replace(/\./g, "").trim();

    if (/^(pre-?k|pk|pre-?kindergarten|prekindergarten)$/.test(value)) return "Pre-K";
    if (/^(k|kg|kindergarten)$/.test(value)) return "K";

    const numeric =
      value.match(/^(?:grade\s*)?0*(\d{1,2})(?:st|nd|rd|th)?(?:\s*grade)?$/) ??
      value.match(/^gr\s*0*(\d{1,2})$/);
    if (numeric && GRADE_VALUES.includes(numeric[1])) return numeric[1];
  }

  return candidates[1] ?? candidates[0] ?? null;
}

/**
 * Current students only. Veracross's `roles` is a free-text list of role
 * names; when it's present it must include plain "Student" (not "Former
 * Student", "Future Student"...). When absent, keep the record.
 */
export function isCurrentStudent(student: Pick<VeracrossStudent, "roles">): boolean {
  if (!student.roles) return true;
  return student.roles
    .split(/[,;]/)
    .map((role) => role.trim().toLowerCase())
    .includes("student");
}

export function studentDisplayName(student: VeracrossStudent): string {
  return [student.preferred_name || student.first_name, student.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Other people on the parent's relationship rows, either column. */
export function relatedPersonIds(
  parentPersonId: string,
  rows: z.infer<typeof relationshipsSchema>["data"]
): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    if (row.related_person_is_deceased) continue;
    // Only relationships that give this adult a parent's standing.
    if (!row.legal_custody && !row.parent_portal_access) continue;
    for (const candidate of [row.person_id, row.related_person_id]) {
      if (candidate !== parentPersonId) ids.add(candidate);
    }
  }

  return Array.from(ids);
}

export interface VeracrossChild {
  externalId: string;
  name: string;
  grade: string;
}

export interface VeracrossFamily {
  personId: string;
  children: VeracrossChild[];
}

/**
 * The signed-in parent's Person ID and current children with grades, or null
 * if the parent can't be matched to exactly one Veracross person.
 */
export async function lookupVeracrossFamily(input: {
  connection: VeracrossConnection;
  clientSecret: string;
  username: string;
}): Promise<VeracrossFamily | null> {
  const route = input.connection.schoolRoute;
  const token = await getVeracrossClientCredentialsToken({
    client: { schoolRoute: route, clientId: input.connection.clientId },
    clientSecret: input.clientSecret,
    scopes: [...VERACROSS_DATA_SCOPES],
  });

  const accounts = personAccountsSchema.parse(
    await dataGet(route, token, "/person_accounts", { username: input.username })
  ).data.filter(
    (account) => account.username?.toLowerCase() === input.username.toLowerCase()
  );

  const personIds = new Set(accounts.map((account) => account.person_id));
  if (personIds.size !== 1) return null;
  const [personId] = personIds;

  let householdId: string | null = null;
  try {
    const parent = parentSchema.parse(await dataGet(route, token, `/parents/${personId}`));
    householdId = parent.data.household_id ?? null;
  } catch (caught: unknown) {
    // Not a parent record at this school: link nothing.
    if (caught instanceof NotFoundError) return null;
    throw caught;
  }

  const students = new Map<string, VeracrossStudent>();

  if (householdId) {
    const household = studentsSchema.parse(
      await dataGet(route, token, "/students", { household_id: householdId })
    );
    for (const student of household.data) students.set(student.id, student);
  }

  // Children who live in another household (separated parents).
  const relationships = relationshipsSchema.parse(
    await dataGet(route, token, "/relationships", { person_id: personId })
  );
  const extraIds = relatedPersonIds(personId, relationships.data)
    .filter((candidate) => !students.has(candidate))
    .slice(0, MAX_RELATIONSHIP_LOOKUPS);

  for (const candidate of extraIds) {
    try {
      const student = studentReadSchema.parse(
        await dataGet(route, token, `/students/${candidate}`)
      );
      students.set(student.data.id, student.data);
    } catch (caught: unknown) {
      if (!(caught instanceof NotFoundError)) throw caught;
      // A spouse or other adult: not a student.
    }
  }

  const current = Array.from(students.values()).filter(isCurrentStudent);
  if (current.length === 0) return { personId, children: [] };

  const levels = gradeLevelsSchema.parse(
    await dataGet(route, token, "/academics/config/grade_levels")
  );
  const levelById = new Map(levels.data.map((level) => [level.id, level]));

  return {
    personId,
    children: current
      .map((student) => ({
        externalId: student.id,
        name: studentDisplayName(student),
        grade:
          mapVeracrossGrade(
            student.grade_level ? levelById.get(student.grade_level) : undefined
          ) ?? "",
      }))
      .filter((child) => child.name && child.grade),
  };
}
