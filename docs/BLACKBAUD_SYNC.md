# Blackbaud Sync

Pull a school's calendar events and parent roster out of Blackbaud so the
assistant can answer from them and only verified parents can sign up.

There are two independent halves. A school can use either without the other.

| Half | Transport | What it feeds |
| --- | --- | --- |
| Calendar events | Per-calendar iCal subscription links | `blackbaud_events` review queue → `events` (the parent calendar and chat context) |
| Parent roster | SKY API OAuth connection | `blackbaud_roster` → sign-up verification |

Blackbaud's SKY School API has no school-calendar endpoint, which is why events
travel over iCal. The OAuth connection is what the SKY API calls use.

## One-time setup (per environment)

### Environment variables

| Var | What it is |
| --- | --- |
| `BLACKBAUD_SUBSCRIPTION_KEY` | Subscription key from the SKY developer account. Global to our app. |
| `BLACKBAUD_CLIENT_ID` / `BLACKBAUD_CLIENT_SECRET` | The SKY application's OAuth credentials. |
| `BLACKBAUD_REDIRECT_URI` | `https://<app-host>/api/blackbaud/oauth/callback`. Must be listed verbatim as a redirect URI on the SKY application. Local dev uses `http://localhost:3000/...`. |
| `BLACKBAUD_LOGIN_REDIRECT_URI` | Optional. Parent sign-in callback, `https://<app-host>/auth/blackbaud/callback`. Defaults to the request origin + that path. Must also be listed verbatim on the SKY application. |
| `BLACKBAUD_TOKEN_ENC_KEY` | AES-256-GCM key used to encrypt refresh tokens at rest. |
| `CRON_SECRET` | Shared secret the scheduled routes check. Vercel Cron sends it automatically as `Authorization: Bearer`. |

Production (Vercel) needs its own `BLACKBAUD_REDIRECT_URI`; the local one will
not work there, and Blackbaud rejects the consent if the URI is not registered
on the app.

### Migrations

`021_blackbaud_verification.sql` through `025_blackbaud_parent_login.sql`.

### Schedule

`vercel.json` runs:

| Route | Schedule | Why |
| --- | --- | --- |
| `/api/cron/sync-blackbaud-calendar` | every 6 hours | A game time can move the morning of. |
| `/api/cron/sync-blackbaud-roster` | daily, 08:00 UTC | Rosters change a few times a term. |
| `/api/cron/publish-announcements` | hourly | Scheduled announcements go live. |

Any of them can be run by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app-host>/api/cron/sync-blackbaud-calendar
```

## Parent sign-in ("Sign in with Blackbaud")

Parents only ever sign in through Blackbaud. Staff and super admins use
email/password at **School staff sign-in** (`/login/staff`, or the toggle on a
school's login page). Parents get no password path at all.

1. `/login` lists every school with a Blackbaud connection ("Choose your
   school"). `/s/<slug>/login` shows that school's button directly.
2. `/auth/blackbaud?school=<slug>` redirects to
   `app.blackbaud.com/oauth/authorize` using PKCE. Both the signed state and
   the verifier are held in an httpOnly `bb_login_state` cookie.
3. `/auth/blackbaud/callback` exchanges the code, then admits the user only if:
   - the token's `environment_id` matches the school's connection, **and**
   - `GET /school/v1/users/me`, called with the parent's **own** token, returns
     `is_parent: true`. That flag comes from the school's Education Management
     roles. No roster sync or staff-level API permission is needed; if the
     call fails, sign-in fails.
4. The Supabase account is found or created by the email Blackbaud returns
   with the token, so a parent's
   older password account keeps its history. Staff accounts (school admin or
   super admin) are refused here and sent to staff sign-in. The parent gets an
   approved `parent` membership and a normal Supabase session. The parent's
   Blackbaud token is discarded.

New school admins are created by a super admin (**Super admin → Assign admin**,
with a temporary password for new accounts).

## Connecting a school (admin UI)

Everything below lives under **Admin → Settings → Blackbaud**.

### 1. Connect the SKY API (roster only)

Click **Connect Blackbaud**. The admin doing this must be able to sign in to
the school's Blackbaud environment. Blackbaud redirects back with
`?blackbaud=connected` and the panel shows the environment id.

Then click **Sync roster now**. The count of active parents appears in the
panel. The roster is not used for sign-in, and syncing it needs a Blackbaud
account with permission to list users (a parent or student account gets
`401 You do not have access to this route`).

### 2. Add calendar feeds (events)

For each Blackbaud calendar parents should see (All School, Upper School
Athletics, Arts, ...):

1. In Blackbaud, open the calendar and copy its **iCal / subscribe** link
   (`webcal://<school>.myschoolapp.com/podium/feed/ical.aspx?...`). The link
   must work without being signed in. Test it first:

   ```bash
   npm run check:feed -- "<url>"
   ```

   A feed that returns HTML is session-bound and cannot be synced.

2. **Add feed**. The URL is fetched and parsed before it is saved, so a bad
   link fails here rather than syncing nothing quietly.
3. Under **Tag everything from this feed as**, pick the divisions and
   categories the whole feed belongs to. This is the strongest auto-tagging
   signal there is.

### 3. Sync and review

**Sync now** pulls every active feed into the review queue. Nothing is visible
to parents yet. Open **Review** (or Admin → Events → Blackbaud) to:

- approve occurrences, which copies them into `events` with their tags;
- dismiss ones that should not be published;
- correct tags. Corrections are remembered as mapping rules keyed on the
  feed's categories, so the next sync tags the same kind of event without
  asking the model.

Events that vanish from the feed show under **Removed upstream**. Anything
already published stays on the parent calendar until an admin dismisses it.

## How the calendar sync behaves

- Window: 30 days back, 400 days forward.
- Recurring series expand to one row per occurrence, so a single cancelled
  practice can be dismissed without dropping the series.
- Floating iCal times resolve in the feed's configured timezone, not UTC.
- Unchanged events (same content hash) keep their review status. A changed
  event goes back to pending; re-approving replaces its published rows.
- A feed that fails leaves the previous staging state untouched and records the
  error on the feed row.

## Not covered

Blackbaud news, resource boards, and announcements do not come through either
half yet. The SKY API exposes `GET /school/v1/content/news/items` and
`/content/news/categories`, but they return only what the *connecting user's*
role (parent, faculty, or student) can see, so they need the OAuth connection
to be made by an account that holds one of those roles.
