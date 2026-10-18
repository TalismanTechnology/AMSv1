import { GRADE_VALUES } from "@/lib/grades";

// Parses the parent roster CSV a school admin uploads (admin settings →
// Sign-in). Pure and dependency-free so the settings page can preview a file
// in the browser and the server action can re-check the same file with the
// same rules.
//
// Accepted shapes, mixed freely:
//   - one row per child:  parent_email, parent_first_name, …, child_name, child_grade
//   - one row per parent: email, name, child1_name, child1_grade, child2_name, …
// Rows are grouped by email, so a parent listed once per child ends up with
// one roster entry holding every child.

// Kept under Next's default 1 MB server-action body limit: the CSV text is
// sent to the upload action as-is.
export const MAX_ROSTER_BYTES = 900 * 1024;
export const ROSTER_TOO_LARGE =
  "This file is larger than 900 KB. Split it or remove extra columns.";
export const MAX_ROSTER_ROWS = 10_000;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 200;

export interface RosterChild {
  name: string;
  /** A lib/grades.ts value ("Pre-K", "K", "1"–"12"), or null if unknown. */
  grade: string | null;
}

export interface RosterParent {
  /** Trimmed + lowercased. */
  email: string;
  firstName: string | null;
  lastName: string | null;
  children: RosterChild[];
}

export interface RowIssue {
  /** 1-based line in the file where the row starts. */
  line: number;
  message: string;
}

export interface RosterParseResult {
  parents: RosterParent[];
  /** Rows that were skipped. */
  errors: RowIssue[];
  /** Rows that were kept, with something worth checking. */
  warnings: RowIssue[];
  /** Set when the whole file is unusable (too big, no email column, …). */
  fatal: string | null;
  stats: {
    /** Non-blank data rows. */
    rows: number;
    parents: number;
    children: number;
    rowsWithErrors: number;
  };
}

// ── CSV records ─────────────────────────────────────────────

interface CsvRecord {
  fields: string[];
  line: number;
}

/**
 * The delimiter of the header line: comma unless the line has more
 * semicolons or tabs (spreadsheet exports in some locales).
 */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const count = (char: string) => firstLine.split(char).length - 1;
  const commas = count(",");
  if (count(";") > commas && count(";") >= count("\t")) return ";";
  if (count("\t") > commas) return "\t";
  return ",";
}

/**
 * RFC 4180-ish: quoted fields may hold delimiters, newlines and doubled
 * quotes; CRLF, LF and CR all end a record. Each record remembers the line it
 * started on.
 */
export function parseCsvRecords(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push({ fields, line: recordLine });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        field += "\n";
        line++;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      // Opening quote (leading spaces before it are dropped).
      field = "";
      inQuotes = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (field !== "" || fields.length > 0 || inQuotes) endRecord();

  // Blank lines (including trailing ones) aren't rows.
  return records.filter((record) => record.fields.some((value) => value.trim() !== ""));
}

// ── Columns ─────────────────────────────────────────────────

/** "Parent E-mail" → "parentemail". */
function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES = {
  email: ["email", "parentemail", "guardianemail", "emailaddress", "parentemailaddress"],
  firstName: ["firstname", "parentfirstname", "guardianfirstname"],
  lastName: ["lastname", "parentlastname", "guardianlastname"],
  fullName: ["name", "parentname", "fullname", "guardianname", "parentfullname"],
  child: ["child", "childname", "student", "studentname"],
  childFirstName: ["childfirstname", "studentfirstname"],
  childLastName: ["childlastname", "studentlastname"],
  grade: ["grade", "childgrade", "studentgrade", "gradelevel"],
} as const;

type Field = keyof typeof ALIASES;

interface WideChild {
  name?: number;
  firstName?: number;
  lastName?: number;
  grade?: number;
}

interface Columns {
  single: Partial<Record<Field, number>>;
  /** child1_name / child1_grade / student2_first_name … keyed by number. */
  wide: Map<number, WideChild>;
}

const WIDE_PATTERN = /^(?:child|student)(\d{1,2})(name|firstname|lastname|grade)?$/;

function mapColumns(headers: string[]): Columns {
  const single: Columns["single"] = {};
  const wide = new Map<number, WideChild>();

  headers.forEach((header, index) => {
    const key = headerKey(header);
    const field = (Object.keys(ALIASES) as Field[]).find((name) =>
      (ALIASES[name] as readonly string[]).includes(key)
    );
    if (field) {
      // The first matching column wins; duplicates are ignored.
      if (single[field] === undefined) single[field] = index;
      return;
    }

    const match = key.match(WIDE_PATTERN);
    if (!match) return;
    const slot = Number(match[1]);
    const part = (
      { name: "name", firstname: "firstName", lastname: "lastName", grade: "grade" } as const
    )[(match[2] ?? "name") as "name" | "firstname" | "lastname" | "grade"];
    const entry = wide.get(slot) ?? {};
    if (entry[part] === undefined) entry[part] = index;
    wide.set(slot, entry);
  });

  return { single, wide };
}

// ── Values ──────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"'.]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) && !email.includes("..");
}

export function normalizeRosterEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "  Ava   SMITH " → "ava smith": how children are matched across rows. */
export function normalizeChildName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

const GRADE_WORDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
];

/**
 * Maps the many ways schools write a grade onto lib/grades.ts values.
 * `recognized` is false for a non-empty value we couldn't map ("Year 3",
 * "0"); the caller keeps the row with no grade and warns, rather than guess.
 */
export function normalizeRosterGrade(raw: string | null | undefined): {
  grade: string | null;
  recognized: boolean;
} {
  const value = clean(raw ?? "").toLowerCase().replace(/\./g, "");
  if (!value) return { grade: null, recognized: true };

  const core = value
    .replace(/^(grade|gr)\s*/, "")
    .replace(/\s*grade$/, "")
    .trim();
  const compact = core.replace(/[\s-]/g, "");

  if (["pk", "prek", "prekindergarten", "prekinder", "preschool"].includes(compact)) {
    return { grade: "Pre-K", recognized: true };
  }
  if (["k", "kg", "kindergarten", "kinder"].includes(compact)) {
    return { grade: "K", recognized: true };
  }

  // Hyphens only join words ("pre-k"); "-1" is not grade 1.
  const numeric = core.replace(/\s/g, "").match(/^0*(\d{1,2})(st|nd|rd|th)?$/);
  const number = numeric
    ? Number(numeric[1])
    : GRADE_WORDS.indexOf(compact) + 1 || null;

  if (number && GRADE_VALUES.includes(String(number))) {
    return { grade: String(number), recognized: true };
  }
  return { grade: null, recognized: false };
}

/** "Smith, Jane" or "Jane Q Smith" → first + last. */
function splitFullName(fullName: string): { first: string; last: string } {
  if (fullName.includes(",")) {
    const [last, ...rest] = fullName.split(",");
    return { first: clean(rest.join(" ")), last: clean(last) };
  }
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// ── Parse ───────────────────────────────────────────────────

function emptyResult(fatal: string): RosterParseResult {
  return {
    parents: [],
    errors: [],
    warnings: [],
    fatal,
    stats: { rows: 0, parents: 0, children: 0, rowsWithErrors: 0 },
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseRosterCsv(text: string): RosterParseResult {
  if (byteLength(text) > MAX_ROSTER_BYTES) {
    return emptyResult(ROSTER_TOO_LARGE);
  }

  const records = parseCsvRecords(text);
  if (records.length === 0) return emptyResult("This file is empty.");

  const [header, ...rows] = records;
  if (rows.length > MAX_ROSTER_ROWS) {
    return emptyResult(
      `This file has ${rows.length.toLocaleString("en-US")} rows; the limit is ${MAX_ROSTER_ROWS.toLocaleString("en-US")}.`
    );
  }

  const columns = mapColumns(header.fields);
  if (columns.single.email === undefined) {
    return emptyResult(
      "No email column found. The first row must be a header with a column named email or parent_email."
    );
  }

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  // Insertion-ordered, so parents keep the file's order.
  const parents = new Map<string, RosterParent & { childIndex: Map<string, number> }>();

  for (const { fields, line } of rows) {
    const get = (index: number | undefined) =>
      index === undefined ? "" : clean(fields[index]);

    const rawEmail = get(columns.single.email);
    if (!rawEmail) {
      errors.push({ line, message: "Missing email address." });
      continue;
    }

    const email = normalizeRosterEmail(rawEmail);
    if (!isValidEmail(email)) {
      errors.push({
        line,
        message: /[,;\s]/.test(email)
          ? `“${rawEmail}” isn't one email address. Put one email address per row.`
          : rawEmail.length > MAX_EMAIL_LENGTH
            ? "Email address is too long."
            : `“${rawEmail}” isn't a valid email address.`,
      });
      continue;
    }

    let firstName = get(columns.single.firstName);
    let lastName = get(columns.single.lastName);
    const fullName = get(columns.single.fullName);
    if (!firstName && !lastName && fullName) {
      ({ first: firstName, last: lastName } = splitFullName(fullName));
    }

    // Children named on this row: the single child columns plus any
    // numbered ones.
    const rowChildren: { name: string; gradeRaw: string }[] = [];
    const singleName =
      get(columns.single.child) ||
      [get(columns.single.childFirstName), get(columns.single.childLastName)]
        .filter(Boolean)
        .join(" ");
    const singleGrade = get(columns.single.grade);
    if (singleName) rowChildren.push({ name: singleName, gradeRaw: singleGrade });
    else if (singleGrade) {
      warnings.push({ line, message: "Grade given without a child's name; ignored." });
    }

    for (const slot of [...columns.wide.keys()].sort((a, b) => a - b)) {
      const entry = columns.wide.get(slot)!;
      const name =
        get(entry.name) ||
        [get(entry.firstName), get(entry.lastName)].filter(Boolean).join(" ");
      const gradeRaw = get(entry.grade);
      if (name) rowChildren.push({ name, gradeRaw });
      else if (gradeRaw) {
        warnings.push({ line, message: `Child ${slot} has a grade but no name; ignored.` });
      }
    }

    const tooLong = [firstName, lastName, ...rowChildren.map((child) => child.name)].some(
      (value) => value.length > MAX_NAME_LENGTH
    );
    if (tooLong) {
      errors.push({ line, message: `A name is longer than ${MAX_NAME_LENGTH} characters.` });
      continue;
    }

    let parent = parents.get(email);
    if (!parent) {
      parent = {
        email,
        firstName: null,
        lastName: null,
        children: [],
        childIndex: new Map(),
      };
      parents.set(email, parent);
    }
    // The first row that names the parent wins.
    if (!parent.firstName && !parent.lastName && (firstName || lastName)) {
      parent.firstName = firstName || null;
      parent.lastName = lastName || null;
    }

    for (const child of rowChildren) {
      const { grade, recognized } = normalizeRosterGrade(child.gradeRaw);
      if (!recognized) {
        warnings.push({
          line,
          message: `Grade “${child.gradeRaw}” for ${child.name} isn't recognised; saved without a grade.`,
        });
      }

      const key = normalizeChildName(child.name);
      const existing = parent.childIndex.get(key);
      if (existing === undefined) {
        parent.childIndex.set(key, parent.children.length);
        parent.children.push({ name: child.name, grade });
      } else if (grade) {
        // Listed again: the last known grade wins.
        parent.children[existing].grade = grade;
      }
    }
  }

  const result = [...parents.values()].map(
    ({ email, firstName, lastName, children }): RosterParent => ({
      email,
      firstName,
      lastName,
      children,
    })
  );

  return {
    parents: result,
    errors,
    warnings,
    fatal: null,
    stats: {
      rows: rows.length,
      parents: result.length,
      children: result.reduce((sum, parent) => sum + parent.children.length, 0),
      rowsWithErrors: errors.length,
    },
  };
}

export const ROSTER_TEMPLATE_CSV = [
  "parent_email,parent_first_name,parent_last_name,child_name,child_grade",
  "jane.smith@example.com,Jane,Smith,Ava Smith,3",
  "jane.smith@example.com,Jane,Smith,Leo Smith,K",
  "",
].join("\r\n");
