# Shipping the AskMySchool iOS app

Everything needed to get the iOS app (`ios/`, Capacitor 8) from this repo into
the App Store: what the app does natively, the listing copy, the review notes,
and a step-by-step release for Lucas. Privacy answers are in
[APP_STORE_PRIVACY.md](./APP_STORE_PRIVACY.md).

| | |
| --- | --- |
| Bundle ID | `app.askmyschool` |
| Display name | AskMySchool |
| Version / build | `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1` in `ios/App/App.xcodeproj` (CI sets the build number automatically) |
| Minimum iOS | 15.0 |
| Devices | iPhone and iPad (`TARGETED_DEVICE_FAMILY = 1,2`) |
| Loads | https://askmyschool.app/login (`capacitor.config.ts`) |
| URL scheme | `app.askmyschool://` (sign-in callback, `open?path=` deep links) |
| Universal links | `applinks:askmyschool.app`, `/s/*/parent` and `/s/*/parent/*` |

## 1. What the app does natively (guideline 4.2)

Apple rejects apps that are "just a website". These are the parts that only
the app has, and are worth pointing out in the review notes:

| Feature | How | Code |
| --- | --- | --- |
| **Push notifications for school announcements** | APNs via `@capacitor/push-notifications`; the token is stored in `push_devices` and announcements are pushed when published. Tapping one opens that announcement | `components/native/native-push.tsx`, `app/api/push/devices`, `lib/push/*` |
| **Deep links** | Notification taps, universal links (`https://askmyschool.app/s/<school>/parent/...` opens the app) and `app.askmyschool://open?path=...` | `components/native/native-shell.tsx`, `lib/native/links.ts`, `app/.well-known/apple-app-site-association` |
| **Secure sign-in in the system sheet** | Blackbaud (and Veracross, PR #14) sign-in runs in `ASWebAuthenticationSession`, never in the app's web view, then hands the session back with PKCE | `ios/App/App/AuthSessionPlugin.swift`, `lib/native/blackbaud-sign-in.ts`, `lib/auth/app-handoff.ts` |
| **Native share sheet** | "Share" on every chat answer, with the cited documents listed | `components/chat/message-share.tsx`, `lib/share-answer.ts` |
| **Haptics** | Pull-to-refresh and share | `lib/native/haptics.ts`, `AppViewController.swift` |
| **Pull-to-refresh** | `UIRefreshControl` on the web view; refreshes data without losing the chat on screen | `ios/App/App/AppViewController.swift` |
| **Offline screen** | Bundled page shown when the site can't load; retries on reconnect, on pull-to-refresh, or on tap. An "offline" banner appears if the connection drops mid-session | `mobile/www/index.html`, `server.errorPath`, `NavigationErrorFilter` |
| **In-app browser** | Links to other sites (school websites, PDFs on storage) open in `SFSafariViewController` over the app | `components/native/native-shell.tsx` (`@capacitor/browser`) |
| **Native launch screen and icon** | Brand icon (light, dark and tinted variants) and launch screen; the launch screen stays until the first page has rendered | `ios/App/App/Assets.xcassets`, `@capacitor/splash-screen` |
| **Safe-area layout** | Web view pinned below the status bar / Dynamic Island | `AppViewController.swift` |

Ideas for later, if review still pushes back on 4.2: a home-screen widget
with upcoming calendar events, Siri / App Intents ("Ask my school when the
next half day is"), adding calendar events to the iOS Calendar with EventKit,
and Face ID to reopen the app.

## 2. App Store listing (draft copy)

**Name** (30 max): `AskMySchool`

**Subtitle** (30 max): `Answers from your school` (24)

**Category:** Education (primary), Productivity (secondary)

**Promotional text** (170 max, can change without review):
> Ask a question, get the answer from your school's own handbooks, calendars
> and announcements, with the source page cited.

**Description** (4000 max):
> AskMySchool gives parents instant, accurate answers from their school's own
> documents.
>
> Instead of digging through handbooks, PDFs and old emails, just ask: "When
> is the next half day?", "What's the dress code for the spring concert?",
> "Who do I contact about the bus?" AskMySchool answers in plain language and
> cites the exact page or passage each fact came from, so you can check it
> yourself.
>
> FOR PARENTS
> • Ask questions in everyday language and get answers with citations
> • Browse your school's documents, calendar and announcements in one place
> • Get a notification when your school posts an announcement
> • Share an answer with a co-parent or caregiver in one tap
> • Sign in securely with your school's Blackbaud or Veracross parent account
>
> FOR SCHOOLS
> AskMySchool only answers from documents your school provides. Staff upload
> handbooks and policies or forward school emails, and the app keeps answers
> current as documents change.
>
> AskMySchool is available to families at participating schools. You'll sign
> in with the account your school already gives you.

**Keywords** (100 max, comma separated, no spaces needed; don't repeat the
app name):
`school,parent,handbook,calendar,announcements,blackbaud,veracross,questions,answers,ai,pta,k12`
(94 characters)

**Support URL:** a page with a way to contact AskMySchool. **TODO (Lucas):**
there isn't one on `main` yet (PR #11 adds contact details to the homepage).
Use e.g. `https://askmyschool.app/#contact` once that ships, or add a
`/support` page.

**Marketing URL** (optional): `https://askmyschool.app`

**Privacy Policy URL:** `https://askmyschool.app/privacy` (PR #8; must be live
before submitting).

**Copyright:** `2026 Talisman Technology` (or the enrolled account's legal
name)

## 3. Age rating questionnaire (draft answers)

Apple's questionnaire (updated 2025; ratings are now 4+, 9+, 13+, 16+, 18+):

| Question | Answer |
| --- | --- |
| Parental controls / age assurance in the app | No |
| Unrestricted web access | **No** (the app shows only AskMySchool; other links open in the system in-app browser, with no address bar to type into) |
| User-generated content shared with other users | **No** (parents' questions and answers are private to them; school admins see question analytics) |
| Messaging and chat between users | No (chat is with the AI, not other people) |
| Advertising | No |
| Gambling, contests, loot boxes | No / None |
| Violence, horror, profanity, sexual content, drugs/alcohol/tobacco, mature themes | None |
| Medical or treatment information | None (a school's health policy documents may be answered from, but the app gives no medical advice) |
| Made for Kids | **No**. The users are parents and school staff, not children |

Expected result: **4+**. Don't choose the Kids category: it would bring
extra Kids-category rules (no third-party AI analytics, parental gates).

## 4. App Review notes and demo account

Sign-in is school-only (parents sign in with their school's Blackbaud or
Veracross account; there's no public sign-up), so **review fails without a
working demo login**. Apple needs credentials that work for the whole review
(often several days) and lets the reviewer reach every feature.

**What Lucas needs to create (pick one):**

1. **Preferred: a demo school with a real test parent.** Seed a demo school
   (`npm run seed:demo` creates "Westfield Academy", slug `westfield`),
   connect it to a Blackbaud SKY sandbox / test environment (or Veracross
   sandbox, `api-sandbox`), and create a test parent account there whose
   email is on the demo school's roster. Put its username and password in
   App Store Connect > App Review Information > Sign-in required.
2. **Fallback: a staff (password) account** for the demo school
   (`/login/staff`), so the reviewer can at least see chat, documents and
   announcements. Parents can't use passwords by design, so this doesn't show
   the parent sign-in; say so in the notes.

Reviewers usually try **account deletion**. After review, check the demo
account still exists, and re-create it if they deleted it.

**Review notes (paste into "Notes", fill in the brackets):**

> AskMySchool is for parents at participating schools. Parents sign in with
> their school's Blackbaud (or Veracross) parent portal account, so we've set
> up a demo school, "Westfield Academy", with a test parent:
>
> 1. Open the app and choose "Westfield Academy".
> 2. Tap "Sign in with Blackbaud". Sign-in opens in Apple's secure sign-in
>    sheet (ASWebAuthenticationSession). Username: [demo username]
>    Password: [demo password]
> 3. Allow notifications when asked.
>
> Things to try:
> • Chat: ask "When is the next early dismissal?" or "What is the dress
>   code?". Answers cite the school document they came from; tap a citation
>   to see the passage.
> • Share an answer with the share icon under it (native share sheet).
> • Announcements: we can send a test push notification during review on
>   request; tapping it opens that announcement.
> • Pull down on any page to refresh. Turn on Airplane Mode to see the
>   offline screen; it reconnects by itself.
> • Account deletion: Menu > Profile > Delete account.
>
> Privacy policy: https://askmyschool.app/privacy. Questions: [Lucas's email /
> phone].

**Push during review:** have a way to publish a test announcement for the demo
school while the app is in review, since reviewers can't post one themselves
as a parent.

## 5. Screenshots plan

Required sizes (App Store Connect accepts these and scales down):

- **iPhone 6.9"**: 1320 × 2868 (or 1290 × 2796) portrait. Required.
- **iPad 13"**: 2064 × 2752 portrait. Required because the app runs on iPad.
  If iPad isn't worth it for v1, set `TARGETED_DEVICE_FAMILY = 1` (iPhone
  only) instead.

Up to 10 per size; plan for 5, all from the demo school (never real
families' data):

1. Chat answer with citations ("Ask anything about your school").
2. Source passage open beside the answer ("Every answer shows its source").
3. Announcements list plus a notification on the lock screen ("Never miss
   an announcement").
4. Calendar ("Your school calendar, in your pocket").
5. School picker / Sign in with Blackbaud sheet ("Sign in with your school
   account").

How, without a Mac: run the site in Chrome DevTools device mode at 440 × 956
(iPhone 16/17 Pro Max) with a 3× device pixel ratio and capture full-size
screenshots, then frame them; or take them from TestFlight on a real iPhone
(side button + volume up). Lock-screen notification shots need a real device.
An app preview video is optional.

## 6. Release steps for Lucas

### 6.1 Apple Developer Program (once, $99/year)

- **You must be 18 or over** (the age of majority) to enroll. Since Lucas is
  under 18, either:
  - **Jesse Haines** (parent/guardian) enrolls as an **Individual** with
    their own Apple Account. The App Store then shows "Jesse Haines" as the
    seller. Jesse adds Lucas to the team (App Store Connect > Users and
    Access) with the **Admin** or **App Manager** role, so Lucas can do the
    rest; or
  - enroll **Talisman Technology** as an **Organization** if it's a legal
    entity: needs a free D-U-N-S number (allow 1–2 weeks), a website, and an
    adult with legal authority to sign Apple's agreements (Jesse). The
    seller then shows as the company, which looks better to schools.
- Enroll at https://developer.apple.com/programs/enroll/ (the Apple Developer
  app on an iPhone also works, so no Mac is needed).
- Accept the agreements in App Store Connect > Business, and fill in the
  tax / banking forms (needed even for a free app's "Free Apps" agreement).

### 6.2 Identifiers and keys (developer.apple.com, once)

1. **Team ID**: Membership details > Team ID (10 characters). Then:
   - Vercel > Project > Settings > Environment Variables: `APPLE_TEAM_ID` =
     the Team ID, and redeploy. Check
     https://askmyschool.app/.well-known/apple-app-site-association shows
     `<TEAMID>.app.askmyschool` instead of `TEAMID.app.askmyschool`.
2. **App ID**: Certificates, Identifiers & Profiles > Identifiers > +, App
   IDs, bundle ID `app.askmyschool` (explicit). Capabilities: **Push
   Notifications** and **Associated Domains**. (Automatic signing can also
   create it, but doing it by hand avoids surprises.)
3. **APNs key** (if not already set up for push): Keys > +, enable Apple
   Push Notifications service, download the `.p8` once. In Vercel set
   `APNS_KEY_ID`, `APNS_TEAM_ID` (the Team ID) and `APNS_PRIVATE_KEY` (the
   `.p8` contents; `\n` escapes are fine), which `lib/push/apns.ts` reads.
   It tries the production APNs host first and falls back to sandbox, so
   TestFlight / App Store builds and Xcode debug builds both work.
4. **App Store Connect API key** (for building without a Mac): App Store
   Connect > Users and Access > Integrations > App Store Connect API > Team
   Keys > +, role **Admin** (cloud signing needs Admin), download
   `AuthKey_XXXX.p8`, note the Key ID and Issuer ID.

### 6.3 Create the app in App Store Connect (once)

My Apps > + > New App: iOS, name `AskMySchool`, language English (U.S.),
bundle ID `app.askmyschool`, SKU `askmyschool-ios`, Full Access. Then fill in
App Information (category, age rating from section 3, privacy policy URL),
App Privacy (APP_STORE_PRIVACY.md), and Pricing (Free).

### 6.4 Build and upload: without a Mac (GitHub Actions)

The repo has `.github/workflows/ios-testflight.yml`, which builds on a
GitHub-hosted Mac (`macos-26`, Xcode 26) with fastlane
(`ios/App/fastlane/Fastfile`). It **only runs when started by hand**.

1. GitHub > repo > Settings > Secrets and variables > Actions > New
   repository secret, four times:
   - `APPLE_TEAM_ID`: Team ID
   - `ASC_KEY_ID`: the API key's Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8_BASE64`: the `.p8` file base64-encoded: `base64 -i
     AuthKey_XXXX.p8 | pbcopy` on a Mac, `base64 -w0 AuthKey_XXXX.p8` on
     Linux, or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`
     in PowerShell.
2. Actions > "iOS: build for TestFlight" > Run workflow (branch `main`).
   It runs `npm ci`, `npx cap sync ios`, then fastlane: picks the next build
   number from TestFlight, archives with automatic signing (Xcode creates the
   distribution certificate and profile through the API key), and uploads.
   Untick "Upload" to only build the `.ipa` (kept as a workflow artifact).
3. macOS runner minutes count 10× against the GitHub Actions quota on
   private repos; one build is roughly 10–20 minutes.

Other no-Mac options: **Codemagic** (free tier with macOS minutes; connect the
repo, add the same API key, use its Capacitor/iOS workflow or run
`bundle exec fastlane beta` from `ios/App`), Bitrise, or Ionic Appflow. Expo
EAS doesn't build plain Capacitor projects.

### 6.5 Build and upload: with a Mac (alternative)

```bash
npm ci
npx cap sync ios          # Node 22+
npx cap open ios          # opens Xcode
```

In Xcode: App target > Signing & Capabilities > Team = your team, "Automatically
manage signing" on. Set the version / build under General. Product > Archive,
then Organizer > Distribute App > App Store Connect > Upload.

### 6.6 TestFlight

1. App Store Connect > TestFlight: wait for the build to finish processing
   (10–30 minutes, an email arrives). Answer the export-compliance question if
   asked (the app declares `ITSAppUsesNonExemptEncryption = NO`, so it
   usually isn't).
2. Internal testing: add yourself and Jesse as internal testers; install the
   TestFlight app on an iPhone and test:
   - [ ] Sign in with Blackbaud for a real school, and for the demo school
   - [ ] Notification permission prompt appears after sign-in; publish a test
         announcement and check the push arrives and opens the announcement
   - [ ] Universal link: tap `https://askmyschool.app/s/<school>/parent/announcements`
         in Notes or Messages; it should open the app (needs the real
         `APPLE_TEAM_ID` deployed)
   - [ ] Share an answer; pull to refresh; Airplane Mode shows the offline
         screen and it recovers
   - [ ] External links open in the in-app browser
   - [ ] Profile > Delete account works (PR #13)
   - [ ] iPad, if keeping iPad support
3. Optional external testing (a few parents) needs a short Beta App Review.

### 6.7 Submit for review

App Store Connect > the app > iOS App > 1.0 Prepare for Submission:
screenshots (section 5), description / keywords / support URL (section 2),
pick the build, App Review Information (demo account and notes, section 4,
plus a contact phone and email), then **Add for Review > Submit**. Choose
"Manually release" if you want to time the launch. Review typically takes 1–3
days. If rejected, reply in Resolution Center; most 4.2 rejections can be
answered by pointing to section 1's native features.

### 6.8 Later releases

Web changes reach the app instantly (it loads the live site): no App Store
release needed. A new build is only needed for native changes (Swift,
`capacitor.config.ts`, plugins, icons, Info.plist). For those, bump
`MARKETING_VERSION` (e.g. 1.0 → 1.1), run the workflow, and submit.

## 7. Readiness checklist

| Item | Status |
| --- | --- |
| Bundle ID, display name, version/build | Done |
| App icon (1024, light/dark/tinted) from the brand logo | Done |
| Launch screen (brand, cream background) | Done |
| Push notifications (APNs) wired to `push_devices` | Done (needs APNs key in Vercel) |
| Sign-in via ASWebAuthenticationSession, not the web view | Done (Blackbaud; Veracross in PR #14) |
| Universal links + `apple-app-site-association` | Done (needs `APPLE_TEAM_ID`) |
| Offline screen, pull-to-refresh, share, haptics, in-app browser | Done |
| Info.plist usage strings, export compliance key | Done |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | Done |
| Privacy nutrition label answers | Drafted (APP_STORE_PRIVACY.md) |
| Third-party AI disclosure + consent (5.1.2(i)) | **Recommended**, not built |
| Privacy policy / terms live at /privacy, /terms | PR #8 (needs legal review, merge) |
| In-app account deletion | PR #13 (merge before submitting) |
| Support URL with contact info | **TODO** (PR #11 or a /support page) |
| Apple Developer enrollment | **Lucas / Jesse** |
| Team ID in Vercel, APNs key, ASC API key, GitHub secrets | **Lucas** |
| App record in App Store Connect | **Lucas** |
| Demo school + reviewer login | **Lucas** |
| Screenshots (iPhone 6.9", iPad 13") | **Lucas** (plan above) |
| Build, TestFlight, submit | **Lucas** (workflow ready) |
