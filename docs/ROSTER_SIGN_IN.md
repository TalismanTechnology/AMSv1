# Parent roster and Require roster match

A school admin can upload a parent roster (CSV) in **Settings → Sign-in**.
The roster is used for one thing: the optional **Require roster match** gate,
which makes Blackbaud and Veracross parents also be on the uploaded list.

Each school has exactly one parent sign-in provider, `schools.auth_provider` =
`blackbaud` (default) or `veracross`. Only super admins can change it.

Both the roster and the gate need migration `045_school_roster.sql`. Until
it's applied, the code behaves exactly as before (see "Deploying").

## Email-code sign-in (removed)

Parents of "roster" schools used to sign in with a 6-digit code emailed to an
address on the uploaded roster. That sign-in has been removed: no school used
it. There is no code request/verify action or form any more, and **Email
code** can't be picked in admin settings.

What's left behind, on purpose:

- The database still allows `schools.auth_provider = 'roster'` (the
  `schools_auth_provider_check` constraint is unchanged). A school with that
  leftover value is read as a retired provider (`lib/auth/provider.ts`): it
  isn't listed on `/login`, its `/s/<slug>/login` page offers no parent
  sign-in and tells parents to contact the school, and its settings panel
  asks a super admin to choose Blackbaud or Veracross.
- The `parent_login_codes` table (migration 045) is left in place, unused.
  No migration drops it.
- `school_roster.children` is still parsed from the CSV and stored, but
  nothing copies it into `children` any more (that only happened on an
  email-code sign-in).

Parents whose sessions start after Blackbaud, Veracross or password
verification still get a server-side magic link (`lib/auth/parent-session.ts`).
That is unrelated and unchanged.

## CSV format

One header row, then data. Comma, semicolon or tab separated; quotes, BOM,
CRLF all fine. Up to 10,000 rows and 900 KB (kept under
Next's default 1 MB server-action body limit). Header names are matched ignoring
case, spaces, underscores and hyphens.

| Column | Accepted headers |
| --- | --- |
| Email (**required**) | `email`, `parent_email`, `parent email`, `guardian_email`, `e-mail`, `email_address` |
| Parent first / last name | `first_name` / `parent_first_name`, `last_name` / `parent_last_name` |
| Parent full name (split if first/last are absent; `Last, First` works) | `name`, `parent_name`, `full_name` |
| Child | `child`, `child_name`, `student`, `student_name`, or `child_first_name` + `child_last_name` |
| Grade | `grade`, `child_grade`, `student_grade`, `grade_level` |
| Several children per row | `child1_name`, `child1_grade`, `child2_name`, … (also `childN_first_name` / `childN_last_name`, `studentN_…`) |

Rows are grouped by email, so both "one row per child" and "one row per
parent" work; children are de-duplicated by name (the last grade given wins).
Grades map onto the app's values: `PK`, `Pre-K`, `PreK` → Pre-K; `K`,
`Kindergarten` → K; `1`, `01`, `1st`, `Grade 1`, `first` … `12`. An unknown
grade keeps the row, stores no grade, and shows a warning. Rows with a missing
or invalid email (or a name over 200 characters) are skipped and listed with
their line number. Template (also downloadable from the settings page):

```csv
parent_email,parent_first_name,parent_last_name,child_name,child_grade
jane.smith@example.com,Jane,Smith,Ava Smith,3
jane.smith@example.com,Jane,Smith,Leo Smith,K
```

Uploading **replaces** the roster: everyone in the file is active, and active
parents missing from it are deactivated (`is_active = false`), never deleted.
Re-uploading brings them back. A file with no valid rows is refused.

## Require roster match

**Settings → Sign-in → Require roster match for every sign-in.** Default off;
can't be turned on with an empty roster. Only super admins can turn it on;
school admins can turn it off. When on, the Blackbaud and Veracross
callbacks check the roster right after the provider accepts the parent and
before any account is touched; parents who aren't listed see "Your email
isn't on <school>'s parent list for AskMySchool yet. Please contact the
school office." (`lib/roster/gate.ts`). While it's off, nothing changes. If the
school row can't be read the gate is treated as off; if the roster lookup
itself fails while the gate is on, sign-in fails with the usual "please try
again".

## Deploying (before / after 045)

The code is safe to deploy before the migration:

- `schools` is only read with `select("*")`; `require_roster_match` is read
  as an optional field, absent = off.
- Missing tables/columns (Postgres `42P01` / `42703`, PostgREST `PGRST204` /
  `PGRST205`) are treated as "not installed" (`lib/supabase/not-installed.ts`):
  the gate is off, and the settings panel says "The parent roster will be
  available after the next database update."
