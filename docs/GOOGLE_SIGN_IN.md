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
