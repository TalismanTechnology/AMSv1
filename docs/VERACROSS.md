# Veracross parent sign-in

Schools on Veracross (instead of Blackbaud) let parents sign in to AskMySchool
with the same login they use for the school's Veracross portal. Each school has
one parent sign-in provider, `schools.auth_provider` = `blackbaud` (default) or
`veracross` (migration `034_school_auth_provider.sql`).

Status: **implemented against Veracross's public docs, not yet tested against a
real Veracross school.** See "Untested / open questions".

## How it works

Veracross is an OAuth 2.0 / OpenID Connect identity provider. Unlike Blackbaud
(one global developer app), **each school creates its own OAuth Application**
in Axiom and gives us its client id/secret. Every URL is scoped by the
school's *route* (the `<route>` in `axiom.veracross.com/<route>`):

| Step | Request |
| --- | --- |
| 1. `/auth/veracross?school=<slug>` | Redirect to `https://accounts.veracross.com/<route>/oauth/authorize?client_id=…&redirect_uri=…&response_type=code&scope=sso&state=…` (+ PKCE, ignored if unsupported) |
| 2. `/auth/veracross/callback` | `POST https://accounts.veracross.com/<route>/oauth/token` with `grant_type=authorization_code`, `client_id`, `client_secret` in the form body |
| 3. | `GET https://accounts.veracross.com/<route>/oauth/userinfo` → `{ sub, preferred_username, email, roles[] }` |
| 4. | Admit only if `roles` contains one of the school's parent roles (default `Parent`) and an email is present; staff accounts in AskMySchool are refused, exactly as with Blackbaud |
| 5. | Same account/session code as Blackbaud (`lib/auth/parent-session.ts`): find-or-create by email, revoke any password, add school membership, start the Supabase session (or the native-app handoff) |
| 6. | Record `sub` in `veracross_parent_links`. A later sign-in where the email now belongs to a different Veracross account (or vice versa) is refused |
| 7. (optional) | If the school enabled the Data API scopes: fill in the parent's children and grades (below) |

`/auth/blackbaud?school=<veracross-school>` redirects to `/auth/veracross`, so
old links and app builds keep working. The native app's sign-in sheet handles
both start paths.

### Children and grade levels (optional, `data_api_enabled`)

With a `client_credentials` token from the same OAuth Application:

1. `GET /v3/person_accounts?username=<preferred_username>` → Person ID (exactly one match required)
2. `GET /v3/parents/{id}` → `household_id`
3. `GET /v3/students?household_id=…` plus `GET /v3/relationships?person_id=…` (rows with legal custody or parent-portal access) → `GET /v3/students/{id}` for children in other households
4. `GET /v3/academics/config/grade_levels` → map each student's `grade_level` id to AskMySchool grades (`Pre-K`, `K`, `1`–`12`; unrecognised names are kept verbatim)

Children are inserted (tagged `external_source='veracross'`) on the first
linked sign-in when the parent has no hand-entered children, and their names
and grades are refreshed on later sign-ins. A child the parent deletes is not
re-added. Any failure here is logged to `veracross_connections.last_error` and
sign-in continues; the parent can still add children on `/welcome`.

## What to request from a Veracross school

Ask someone at the school with the **OAuth_App_Admin** security role (SysAdmin
alone is not enough) to create an OAuth Application for AskMySchool in Axiom
(Identity & Access Management → Configuration → **OAuth Applications** → Add
Record), or to invite us as an Integration Partner, and send back:

1. **School route** — e.g. `polyprep` from `axiom.veracross.com/polyprep`.
2. **Client ID** and **Client Secret** of that OAuth Application. Prefer the
   Partner Portal over email for the secret.
3. Confirmation that these are on the application:
   - **Scopes:** `sso` (SSO / Single Sign-On). `openid` instead also works if
     that's what they enable; tell us which.
   - **Redirect URI:** `https://askmyschool.app/auth/veracross/callback`
     (exactly; HTTPS only. Add a staging URL too if needed.)
4. Optional, for automatic children/grades: also enable `person_accounts:list`,
   `parents:read`, `students:list`, `students:read`, `relationships:list`,
   `academics.config.grade_levels:list`.
5. Which Veracross role(s) parents have. Default is `Parent`. A school whose
   guardians use a different role name must tell us.
6. A test parent account (or a staff member willing to try it) for the first
   sign-in.

## Setup steps (per school)

1. Apply `034_school_auth_provider.sql` (once, manually, after 031–033).
2. Store the credentials (encrypted with `BLACKBAUD_TOKEN_ENC_KEY`, the same key
   as the Blackbaud tokens) without switching sign-in yet:

   ```sh
   VERACROSS_CLIENT_SECRET='…' npx tsx scripts/veracross-connect.ts \
     --school <askmyschool-slug> --route <veracross-route> --client-id '<id>' \
     [--scopes "sso"] [--parent-roles "Parent"] [--data-api]
   ```

3. When the school is ready, re-run with `--activate` (sets
   `schools.auth_provider = 'veracross'`). `--deactivate` switches back to
   Blackbaud and disables the stored credentials.
4. Optional env: `VERACROSS_LOGIN_REDIRECT_URI` to pin the callback URL
   (defaults to the request origin + `/auth/veracross/callback`). It must match
   what the school registered.

## Roster and calendar sync (not implemented — plan)

TODO(veracross-sync). The Data API has what we'd need; nothing is built yet:

- **Roster** (equivalent of `blackbaud_roster`): `GET /v3/parents`
  (`parents:list`, filter `role=Parent`, paginate with `X-Page-Number` /
  `X-Page-Size` ≤ 1000, incremental via `on_or_after_last_modified_date` on
  students/relationships). Store in a `veracross_roster` table, sync from a
  cron like `api/cron/sync-blackbaud-roster`.
- **School calendar**: `GET /v3/events/group_events` (`events.group_events:list`),
  keep rows with `display_on_parent_calendar`, window with
  `on_or_after_start_date` / `on_or_before_end_date`, `grade_level` /
  `school_level` for division tagging. Feed the existing `blackbaud_events`
  review queue pattern (or a provider-neutral copy of it).
- **Per-parent calendar**: `GET /v3/calendars/parent_calendars/{parent_id}`
  (`calendars.parent_calendars:list`) would give each family's own events.
- Dates are in the school's local time zone; `last_modified_date` is UTC.

## Untested / open questions

No real Veracross tenant was available, so none of this has run against
Veracross. Before the first school goes live, verify on a test account:

- `state` is returned on the redirect (standard OAuth; not listed on the
  Authorize page). PKCE parameters are sent but not advertised in discovery;
  RFC 6749 says unknown parameters are ignored.
- The exact role string parents carry in `userinfo.roles` (docs example shows
  `"Parent"`; configurable per school).
- Whether `userinfo.email` is always populated and verified for parents.
  Accounts are keyed on it, as with Blackbaud.
- That `userinfo.preferred_username` equals `person_accounts.username` (the
  docs say schools choose its format and to use it "for display purposes").
  If not, children lookup simply finds no one and parents use `/welcome`.
- Which column of a relationship row is the child; the code accepts either
  side and only keeps people who are students.
- Values of `students.roles` (we keep rows whose roles include plain
  `Student`, or have no roles field).

## Sources (retrieved 2026-10-09)

- Creating an SSO Integration — https://api-docs.veracross.com/docs/docs/5fb9f96bc480a-creating-an-sso-integration
- Authorize — https://api-docs.veracross.com/docs/docs/fb8d893996a83-authorize
- Create Access Token — https://api-docs.veracross.com/docs/docs/bd459afff2bcb-create-access-token
- User Info — https://api-docs.veracross.com/docs/docs/2fe33316cbd58-user-info
- Access Tokens — https://api-docs.veracross.com/docs/docs/097f6c769cafb-access-tokens
- Using the Data API — https://api-docs.veracross.com/docs/docs/cd9d140be5811-using-the-data-api
- OIDC discovery (sandbox) — https://accounts.veracross.com/api-sandbox/.well-known/openid-configuration
- Person Accounts / Parents / Students / Relationships / Grade Levels / Events / Parent Calendars —
  https://api-docs.veracross.com/docs/docs/cb6d3965fde44-list-person-accounts,
  https://api-docs.veracross.com/docs/docs/996d9153ba64d-read-parents,
  https://api-docs.veracross.com/docs/docs/d50279dec5fd1-list-students,
  https://api-docs.veracross.com/docs/docs/726f1bf9a7d57-list-relationships,
  https://api-docs.veracross.com/docs/docs/d42a1136866ee-list-academics-configuration-grade-levels,
  https://api-docs.veracross.com/docs/docs/1e238d1b394d6-list-events,
  https://api-docs.veracross.com/docs/docs/74c4f2ba95b13-list-calendars-parent-calendars
- Creating an OAuth Application (school workflow) — https://community.veracross.com/s/article/Creating-an-OAuth-Application-School-Workflow
- Setting up Integration Partners — https://community.veracross.com/s/article/Setting-Up-New-Integration-Partners-in-Veracross-API
