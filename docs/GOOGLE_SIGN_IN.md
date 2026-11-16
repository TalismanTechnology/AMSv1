# Sign in with Google (staff and super-admin)

"Continue with Google" on staff sign-in, using Supabase Auth's Google
provider. Parents are unaffected: Blackbaud, Veracross and email-code sign-in
don't change, and parent sign-in never shows the Google button.

## Turning it on

Set `GOOGLE_SIGNIN_ENABLED=true` in Vercel and redeploy (Vercel env changes
only reach new deployments). Off by default. While off:

- no Google button anywhere, and `/auth/google` refuses to start;
- "Require Google sign-in" isn't enforced, so turning the flag off is also the
  escape hatch that brings password sign-in back for everyone.

Supabase setup (already done unless noted): Google provider enabled, sign-ups
disabled. Add `https://askmyschool.app/auth/callback**` to Auth → URL
Configuration → Redirect URLs. If it's missing, Supabase sends the browser to
the Site URL instead; middleware forwards that to `/auth/callback` (only when
this browser started a Google sign-in), so sign-in still works.

## Where the button appears

- `/login/staff` (school admins and the super-admin)
- `/s/<slug>/login`, inside "School staff sign-in" only

## Who gets in

`app/auth/callback/route.ts` redeems the code, then `decideGoogleAccess`
(`lib/auth/google-sign-in.ts`) decides:

| Account | Result |
| --- | --- |
| super-admin | allowed (`/super-admin`, or the school they came from; the owner lock still applies there) |
| admin of a school | allowed into a school they administer; from another school's login page, refused |
| parent / no role | signed out at once, "No AskMySchool admin account uses this Google email…" |
| email not on any account | Supabase refuses ("Signups not allowed"), same message |
| Google email not verified | refused |

Nothing creates a profile or membership or grants a role. Supabase links the
Google identity to an existing account with the same verified email
automatically; no manual linking.

## Native app

Google blocks sign-in inside web views, so the app opens `/auth/google` in the
system sign-in sheet (the existing `AuthSession` plugin on iOS, a Custom Tab
on Android) and the session comes back through `/auth/app-handoff`, exactly
like Blackbaud. No new app build needed.

## Require Google sign-in (password off) for an account

Stored as `app_metadata.password_signin_disabled` (only the service role can
write app_metadata). When on, and Google sign-in is enabled:

- the password form says "This account signs in with Google." and signs out;
- middleware ends any session whose token says it came from a password
  (`amr`), including one obtained straight from Supabase's password endpoint.

Super-admin: Super Admin → Sign-in security → "Require Google sign-in for my
account". It can only be switched on after signing in with Google once.

Any account, by SQL (service role / SQL editor):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"password_signin_disabled": true}'
where email = 'someone@example.com';
```

Use `false` to turn it back off.

**Still possible:** someone who knows the password can get a token from
Supabase's API directly and use it against Supabase's own REST API (RLS still
applies). Every askmyschool.app page and API route refuses that session, but
Supabase's API doesn't know about this setting. To close that fully, also change the
account's password to a random value.

## Admin Google-only (`ADMIN_GOOGLE_ONLY`)

Admin powers only come from a session that Google sign-in started. A school
admin or the super-admin signed in any other way (password, email code, magic
link, Blackbaud, Veracross, a token straight from Supabase) gets no admin
pages, admin actions or admin API routes. Parents are unaffected. Off unless
`ADMIN_GOOGLE_ONLY=true` (exactly; read on the server).

### How a session counts as "Google"

`/auth/callback` (web) and `/auth/app-handoff` (native app) record the new
session's id (the access token's `session_id` claim, which survives token
refreshes) in `public.google_auth_sessions` (migration 053, service role
only). The checks look the current token's `session_id` + user up there. The
token's `amr` can't be used: the app's Google sign-in ends in a magic-link
verify, so it says `otp`, exactly like a parent's email code. A Google handoff
(`google:` slug) can only be minted by `/auth/callback`; Blackbaud and
Veracross handoffs refuse anything that isn't a school slug.

If recording fails the sign-in still goes ahead; admin access then asks for
Google sign-in again (fails closed).

### What is enforced (flag on)

| Who / session | Result |
| --- | --- |
| admin or super-admin, Google session (web or app) | as today (the owner lock still applies) |
| school admin, any other session | admin pages and that school's parent pages → `/login/staff` with "For security, admin access requires signing in with Google…"; admin actions → that error; admin API routes → 403 |
| super-admin, any other session | `/super-admin` and every school → `/login/staff` with the message; never elevated; super-admin actions refuse |
| admin of school A who is a parent at school B, any session | school B works as a parent, as today |
| super-admin who is also a parent somewhere, non-Google session | refused there too (Postgres RLS's `is_super_admin()` would still give that session every school's data, so it can't safely be "just a parent") |
| parents | unchanged; no extra lookup |

Sign-in pages: `/login/staff` and the staff section of `/s/<slug>/login` show
only "Continue with Google" ("Admins sign in with Google."); the password
action refuses staff accounts. Existing admin sessions from before the flag
was turned on stop working as admin and are asked to sign in with Google.

`ADMIN_GOOGLE_ONLY=true` with `GOOGLE_SIGNIN_ENABLED` off means **no admin can
sign in**; the staff forms say admin sign-in is unavailable and the server
logs a warning. There's no silent fallback to passwords.

### Turning it on

1. Apply `supabase/migrations/053_google_auth_sessions.sql`. (Without it no
   session counts as Google and every admin is refused.)
2. Deploy the code (flag still off; Google sign-ins now get recorded).
3. Set `ADMIN_GOOGLE_ONLY=true` in Vercel (Production) and redeploy.
4. Sign in with Google on the web and in the app, as a school admin and as the
   super-admin; check a password sign-in is refused.

### Break-glass

Set `ADMIN_GOOGLE_ONLY` to `false` (or remove it) in Vercel and redeploy.
Everything goes back to today's behaviour; the table can stay.

### Residual risk

Supabase's own REST API doesn't know about this flag. Someone with an admin's
password, or who can get an email code / magic link for an admin's address,
can still get a Supabase token and query Supabase directly, within RLS (which
gives a school admin their school and the super-admin everything). Every
askmyschool.app page, action and API route refuses that session. To narrow it:

- give admin accounts long random passwords, or turn on "Require Google
  sign-in" (`password_signin_disabled`, above), which also ends password
  sessions in middleware;
- possible follow-up: require a `google_auth_sessions` row for
  `auth.jwt() ->> 'session_id'` inside the RLS helpers `is_school_admin()` and
  `is_super_admin()`, so Supabase itself enforces it (not done here).

Rows of signed-out or expired sessions are deleted with the session when the
migration could reference `auth.sessions`; otherwise clean up occasionally
(see the migration).
