# Roster + email-code parent sign-in

The universal fallback for schools that aren't on Blackbaud or Veracross. A
school admin uploads a parent roster (CSV); parents on that roster sign in
with a 6-digit code emailed to them. Each school still has exactly one parent
sign-in provider, `schools.auth_provider` = `blackbaud` (default),
`veracross` or `roster`.

Separately, any school can turn on **Require roster match**: parents must also
be on the uploaded roster, whichever provider they sign in with.

Both need migration `044_school_roster.sql`. Until it's applied, the code
behaves exactly as before (see "Deploying").

## How it works

| Step | What happens |
| --- | --- |
| 1. `/s/<slug>/login` | For a roster school the card shows an email field ("Email me a code") instead of a provider button (`components/auth/roster-sign-in-form.tsx`). |
| 2. `requestParentCode` | `actions/roster-sign-in.ts`. Normalises the email, applies the rate limits, and if the email is on the school's **active** roster stores a new code (retiring older ones) and emails it after the response. Either way the answer is the same: "If that email is on the school's list, a code is on its way." |
| 3. `verifyParentCode` | Checks the newest unconsumed code (10 minutes, 5 tries), claims it once, re-checks the roster, then runs the same account/session code as Blackbaud and Veracross (`lib/auth/parent-session.ts`): find-or-create by email, refuse staff accounts, revoke any password on a not-yet-secured account (except `parent_password_login` demo accounts), add the school membership, fill in children, start the Supabase session. |
| 4. | Redirect to `/s/<slug>/parent/chat`; middleware sends first-time parents to `/welcome`, which skips itself when children were filled in. |

Codes are never stored in plain text: `parent_login_codes.code_hash` is
HMAC-SHA256(`<schoolId>:<email>:<code>`) keyed with the server secret, and
comparison is constant-time.

### No account enumeration

- A code request gets the same message whether or not the email is on the
  roster, does the same database work (unlisted addresses get a
  never-redeemable row keyed by a hash of the address, not the address), and
  the email is sent after the response.
- Wrong, expired and used-up codes all get the same message.
- When rate-limited, a request still gets the neutral message plus "please
  wait a few minutes".

### Rate limits

Counted from `parent_login_codes` rows, so they hold across serverless
instances (`lib/roster/login-code.ts`, `RATE_LIMITS`):

| Limit | Value |
| --- | --- |
| Code requests per school + email | 3 per 15 minutes, 10 per 24 hours |
| Code requests per IP (keyed hash of the first `X-Forwarded-For` hop) | 20 per hour |
| Tries per code | 5 |
| Wrong codes per school + email, across codes | 10 per 15 minutes → "Too many attempts. Request a new code in a few minutes." |

The login page also has a 30-second cooldown on "Resend code".

### Children

On each sign-in the roster's children for that parent are synced into
`children` (`lib/roster/children.ts`), with the same rules as Veracross:
`external_source = 'roster'`, `external_id` = the child's name lowercased with
spaces collapsed. Linked children get their name/grade refreshed. New roster
children are added only on the parent's first roster sign-in (no
roster-linked children yet) when they have no hand-entered children, or when
they have no children at all. Nothing is deleted. `children.grade` is NOT
NULL, so a child whose grade wasn't recognised is not inserted; the parent can
add them in the app. A failure here is logged and sign-in continues.

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

## Turning it on for a school

1. Apply `044_school_roster.sql` (once, manually).
2. A school admin opens **Settings → Sign-in**, uploads the roster and checks
   the preview. A super admin then picks **Email code** (only possible once
   the roster has an active parent) and confirms. Every change is in the
   audit log.
3. The school now appears on `/login` (picking it opens `/s/<slug>/login`).
   Old `/auth/blackbaud?school=<slug>` links redirect to the login page.

To switch back, a super admin picks Blackbaud/Veracross in the same panel.
Nothing is deleted.

Changing the provider can lock every parent out of a school, so only super
admins (`profiles.role = 'super_admin'`) can do it; school admins see the
current method read-only with a note to contact AskMySchool support. Roster
uploads stay with school admins.

### Require roster match (any provider)

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

## Environment

| Variable | |
| --- | --- |
| `LOGIN_CODE_SECRET` | Optional. HMAC key for codes and IP hashes. Falls back to `BLACKBAUD_TOKEN_ENC_KEY` (already set in prod). Changing it invalidates outstanding codes. |
| `AUTH_EMAIL_FROM` | Optional sender for code emails. Falls back to `EMAIL_FROM`, then `AskMySchool <noreply@askmyschool.app>`. The domain must be verified in Resend. |
| `RESEND_API_KEY` | Required to actually send codes (existing). |

## Deploying (before / after 044)

The code is safe to deploy before the migration:

- `schools` is only read with `select("*")`; `require_roster_match` is read
  as an optional field, absent = off.
- Missing tables/columns (Postgres `42P01` / `42703`, PostgREST `PGRST204` /
  `PGRST205`) are treated as "not installed" (`lib/supabase/not-installed.ts`):
  no school can be a roster school, the gate is off, and the settings panel
  says "Roster sign-in will be available after the next database update."
- Saving `auth_provider = 'roster'` before 044 hits the old check constraint
  and returns "Email-code sign-in isn't available yet".

## iOS / Android

The apps are a Capacitor web view on `https://askmyschool.app`, so the
email-code form runs inside the app's own web view and the session cookies
land there directly. There's no system sign-in sheet and no app handoff: the
roster provider has no `startPath`, so `components/native/native-bridge.tsx`
never intercepts it, and nothing navigates off askmyschool.app.

App Store guideline 4.8 (Login Services) only applies to third-party or
social login; this is the app's own account system, so no Sign in with Apple
is needed. Don't add Google/Apple/Facebook sign-in here.
