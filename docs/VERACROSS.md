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

The `client_credentials` token is **cached in memory** per school route +
client id + scope set (`lib/veracross/token-cache.ts`). Veracross allows at
most 10 active tokens per OAuth Application and silently revokes the oldest
when an 11th is created; tokens last an hour and can't be refreshed. So each
warm server instance mints one token and reuses it for
min(`expires_in` − 5 min, 55 min); concurrent sign-ins share one in-flight
request. On Vercel that's roughly one token per warm instance per hour, far
below the cap. If the Data API answers 401 (expired, or revoked by the cap),
the token is dropped and the lookup retried once with a fresh one; a second
401 is logged and sign-in continues without children. The per-parent
authorization-code tokens are not cached: Veracross counts those per user,
and each is used once for userinfo and dropped.

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
   - **Scopes:** please enable **both** `sso` (SSO / Single Sign-On) and
     `openid`, and tell us which ones you actually enabled. (Finalsite's
     Veracross guide asks for both too:
     https://www.finalsitesupport.com/hc/en-us/articles/360007065032.) We
     request `sso` by default; Veracross requires the app to have "one of"
     the two, so this works with either or both. If a school only has
     `openid`, set `--scopes openid`.
   - **Redirect URI:** `https://askmyschool.app/auth/veracross/callback`
     (exactly; HTTPS only. Add a staging URL too if needed.)
4. Optional, for automatic children/grades: also enable `person_accounts:list`,
   `parents:read`, `students:list`, `students:read`, `relationships:list`,
   `academics.config.grade_levels:list`.
5. Which Veracross role(s) parents have. Default is `Parent`. A school whose
   guardians use a different role name must tell us.
   - Newly enrolled families carry **"Parent of Future Student"** instead of
     `Parent` until the school runs its Start School Year procedure
     ([Start School Year](https://community.veracross.com/s/article/Start-School-Year-Procedure),
     [role definitions](https://community.veracross.com/s/article/Person-Role-Definitions)).
     They are **refused by default**. Ask whether the school wants incoming
     families to have access before the year starts; if so, save the
     connection with `--parent-roles "Parent,Parent of Future Student"`.
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
   The script prints the scopes and parent roles it saved; check them
   against what the school told us. `--help` lists every option.
4. Production sets `VERACROSS_LOGIN_REDIRECT_URI=https://askmyschool.app/auth/veracross/callback`
   (Vercel env), so the redirect URI is the one the school registered no
   matter which host served the request. Without it, the request origin +
   `/auth/veracross/callback` is used. A value that isn't an absolute
   `https://` URL ending in `/auth/veracross/callback` is logged
   (`[veracross] VERACROSS_LOGIN_REDIRECT_URI must be …`) and ignored.

### Veracross env vars

| Variable | Default | Notes |
| --- | --- | --- |
| `VERACROSS_LOGIN_REDIRECT_URI` | request origin + `/auth/veracross/callback` | Production: `https://askmyschool.app/auth/veracross/callback`. Must be absolute `https` and end in `/auth/veracross/callback`, else ignored with an error log. Must exactly match the school's registered Redirect URI. |
| `VERACROSS_ACCOUNTS_ORIGIN` | `https://accounts.veracross.com` | Tests / staging mocks only. `https`, or `http` for `localhost`/`127.0.0.1`; otherwise ignored with a warning. **Ignored when `VERCEL_ENV=production`.** |
| `VERACROSS_API_ORIGIN` | `https://api.veracross.com` | Same rules, for the Data API. |
| `BLACKBAUD_TOKEN_ENC_KEY` | (required) | Reused: encrypts each school's Veracross client secret and signs the sign-in `state`. No separate Veracross key. |

## Go-live checklist (first school)

1. School created the OAuth Application with `sso` and/or `openid`, the exact
   redirect URI above, and (optional) the Data API scopes. They told us which
   sign-in scopes are on and which parent roles to admit (incl. whether
   "Parent of Future Student" should get in).
2. `VERACROSS_LOGIN_REDIRECT_URI` is set in Vercel production; no
   `VERACROSS_*_ORIGIN` overrides are set there (they'd be ignored anyway,
   with a warning).
3. Migration 034 applied; `scripts/veracross-connect.ts` run **without**
   `--activate`; printed scopes/roles checked.
4. Activate, then sign in with the school's test parent on web and in the
   app. Check Vercel logs for the `[veracross] {"event":"sign_in",…}` line.
5. Sign in with a staff/faculty account: it must be refused (log line
   `"step":"gate","reason":"not_a_parent"` with the roles it carried).
6. If the Data API is on: the test parent's children and grades appear. If
   not, look for `"step":"client_token"` / `"step":"data_api"` lines and
   `veracross_connections.last_error`.
7. Rollback is `--deactivate` (back to Blackbaud).

## Logs

Every failure writes one line to the server log, searchable as `[veracross]`:

```
[veracross] {"event":"failure","step":"token","school":"<uuid>","route":"polyprep","status":400,"reason":"invalid_grant","hint":"code expired/used or redirect_uri mismatch"}
```

`step` is one of `authorize`, `token`, `userinfo`, `gate`, `link`,
`children`, `client_token`, `data_api`. Lines carry the HTTP status and OAuth
error code when there is one, plus a hint for the usual suspects
(`invalid_grant`, `invalid_client`, Data API 401 → "token expired or revoked
(10-token cap?)"). They never include secrets, tokens, codes or full emails.
Token, userinfo and children failures are also stored in
`veracross_connections.last_error` as before. Each successful sign-in logs
`{"event":"sign_in","school":…,"route":…,"firstLink":…,"app":…,"children":{"found","inserted","updated"}}`
(no personal data).

## Testing without a school

`lib/veracross/veracross.mock.test.ts` (part of `npm test`) runs the real
sign-in code against a mock Veracross on `127.0.0.1`
(`lib/veracross/mock-server.test-helper.ts`): authorize redirect, token
exchange (PKCE, wrong secret, reused code), userinfo, the parent gate, the
Data API children lookup, the client-token cache (single-flight, TTL, 401
retry, 10-token cap) and the origin-override rules. The route handlers call
`buildVeracrossStart` / `identifyVeracrossParent` (`lib/veracross/sign-in.ts`),
which those tests exercise directly.

Veracross also has a sandbox route, `api-sandbox`
(`https://accounts.veracross.com/api-sandbox/...`), but credentials for it
come from partners@veracross.com. With sandbox credentials, save a test
school's connection with `--route api-sandbox` and sign in as a sandbox
parent.

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

Added 2026-10-18 (role and scope guidance; not re-fetched when this was written):

- Start School Year Procedure — https://community.veracross.com/s/article/Start-School-Year-Procedure
- Person Role Definitions — https://community.veracross.com/s/article/Person-Role-Definitions
- Finalsite: Veracross SSO setup — https://www.finalsitesupport.com/hc/en-us/articles/360007065032
