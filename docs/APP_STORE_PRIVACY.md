# App Store privacy answers (draft)

Draft answers for **App Store Connect > App Privacy** ("nutrition label") for
the AskMySchool iOS app, based on what the code stores as of October 2026.
Keep this, `ios/App/App/PrivacyInfo.xcprivacy` and the privacy policy
(`/privacy`, PR #8) saying the same thing. Re-check before every release that
adds a data field, an SDK or a third-party service.

> Not legal advice. The privacy policy in PR #8 is itself marked "needs legal
> review"; these answers should be reviewed with it.

## How to read this

The app is a native shell around https://askmyschool.app. Apple counts data
the app's *server* stores about the user as "collected", so this covers the
website's data too, whenever someone signs in from the app.

- **Tracking:** No. There is no advertising, no ad SDK, no data broker, and
  no linking of AskMySchool data with other companies' data. No
  `NSUserTrackingUsageDescription` / ATT prompt is needed.
- **Third-party analytics / crash SDKs:** none (no Firebase Analytics,
  Sentry, PostHog, Mixpanel, etc. in `package.json` or the iOS project).
- **Service providers** that process data on AskMySchool's behalf (they don't
  make the data "shared for tracking", but must be named in the privacy
  policy): Supabase (database, auth, file storage), Vercel (hosting), Google
  Gemini API (answers, embeddings, document sorting; OpenAI / Anthropic SDKs
  are also in the code base), Resend (email), Blackbaud and Veracross (sign-in
  and roster), Apple APNs / Google FCM (push).

## Step 1: "Do you or your third-party partners collect data from this app?"

**Yes.**

## Step 2: data types

| App Store category | Data type | Collected? | What it is in AskMySchool | Where in the code |
| --- | --- | --- | --- | --- |
| Contact Info | **Name** | Yes | Parent / staff name from Blackbaud or Veracross sign-in; children's names a parent enters (or that Veracross supplies, PR #14) | `profiles.full_name`, `children`, `lib/blackbaud/parent-login.ts` |
| Contact Info | **Email Address** | Yes | Account email, matched against the school roster | `profiles.email`, `blackbaud_roster` |
| Contact Info | Phone Number | No | | |
| Contact Info | Physical Address | No | | |
| Contact Info | Other User Contact Info | No | | |
| Health & Fitness | — | No | | |
| Financial Info | — | No | | |
| Location | Precise / Coarse | No | No location APIs; IP addresses only in standard server logs | |
| Sensitive Info | — | No | | |
| Contacts | — | No | | |
| User Content | Emails or Text Messages | No | (Inbound school email is *school* content, sent by staff to the school's intake address, not user content from the app) | |
| User Content | Photos or Videos | No | Parents don't upload media. Staff document upload (PDF/Office/text) is School content | |
| User Content | Audio Data | No | | |
| User Content | Gameplay Content | No | | |
| User Content | Customer Support | Yes, if the feedback form in PR #8 ships | Feedback messages | `actions/feedback.ts` (PR #8) |
| User Content | **Other User Content** | Yes | Chat questions and answers (chat history); answer thumbs up/down | `chat_sessions`, `chat_messages`, `chat_feedback` |
| Browsing History | — | No | | |
| Search History | **Search History** | Yes | Questions typed into chat / document search are stored, and shown to the school's admins as question analytics | `analytics_events` (`event_type = question`) |
| Identifiers | **User ID** | Yes | AskMySchool account id; Blackbaud user id / Veracross account id | `auth.users`, `blackbaud_roster.bb_user_id`, `veracross_parent_links` |
| Identifiers | **Device ID** | Yes (conservative) | APNs push token, stored to deliver announcements. Apple doesn't strictly call a push token a device ID; declaring it is the safe choice | `push_devices` |
| Purchases | — | No | | |
| Usage Data | **Product Interaction** | Yes | First-party usage events (questions asked, feedback) | `analytics_events` |
| Usage Data | Advertising Data | No | | |
| Usage Data | Other Usage Data | No | | |
| Diagnostics | Crash Data / Performance Data | No | No crash reporter in the app | |
| Diagnostics | Other Diagnostic Data | No | | |
| Surroundings | — | No | | |
| Body | — | No | | |
| Other Data | **Other Data Types** | Yes | Children's grade levels (`profiles.child_grade`, `children`) | |

## Step 3: for each "Yes" type

Same answers for every type above unless noted:

- **Used for:** App Functionality. Search History, Other User Content and
  Product Interaction: also **Analytics** (the school's admin dashboard shows
  which questions parents ask). Nothing is used for Third-Party Advertising,
  Developer's Advertising or Marketing, or Product Personalization beyond the
  app's normal function.
- **Linked to the user's identity:** Yes (all of it sits on the account).
- **Used for tracking:** No.

## Apple guideline 5.1.2(i): personal data and third-party AI

Since November 2025 Apple requires apps to **clearly disclose** when personal
data is shared with third parties, **including third-party AI**, and to get
**explicit permission** first. AskMySchool sends parents' questions (and, per
the PR #8 privacy policy, children's names and grade levels) to Google's
Gemini API.

Status / recommendation:

- [x] Disclosed in the privacy policy (PR #8, draft).
- [ ] **Recommended before submission:** an in-app notice the first time a
  parent opens chat ("Your questions are answered by Google's Gemini AI using
  your school's documents. [Privacy policy] [Continue]"), stored per account.
  Not built in this PR: it changes the product for web users too, so it's
  Lucas's call. Without it, a reviewer could cite 5.1.2(i).

## Account deletion (guideline 5.1.1(v))

In-app: **Profile > Delete account** (`/s/<school>/parent/profile`, PR #13).
Reachable in the app from the sidebar / mobile menu "Profile" link. Deletes the
account, chats, feedback and push devices; admin-side deletion also removes
the auth user (PR #13).
