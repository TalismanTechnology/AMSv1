# Email Ingestion

Forward school emails to a private per-school address and have their
attachments **and** body automatically ingested as documents, then auto-sorted
into categories and folders by AI. Each division (Lower, Middle, Upper School)
can also have its own address, so the assistant knows which division an email
is about.

## How it works

1. Each school gets a unique whole-school inbound address,
   `<token>@<INBOUND_EMAIL_DOMAIN>`, generated the first time an admin enables
   ingestion. Admins can add one more address per division. Addresses live in
   the `email_ingestion_addresses` table.
2. Resend receives mail at `INBOUND_EMAIL_DOMAIN` (via an MX record) and POSTs
   an `email.received` event to `/api/inbound-email`.
3. The webhook verifies the Svix signature (`svix-id`, `svix-timestamp`,
   `svix-signature` headers, checked against `RESEND_INBOUND_SECRET` over the
   raw body; stale timestamps are refused) and returns 400 on a bad
   signature, or 500 if the secret isn't configured. It then finds which of
   our addresses the mail reached, checking `to`, `cc`, `bcc`, and
   `received_for`. That decides the school and the divisions.
4. The sender gate (secure by default):
   - **Allowed domains set:** mail is ingested only when the sender's address
     ends with one of them; everything else is rejected (`rejected_domain`).
   - **No allowed domains:** nothing is ingested automatically. The email is
     logged as `pending_review` and held until a school admin approves or
     rejects it (see *Reviewing held emails*). Only the metadata (sender,
     subject, Resend email id, divisions) is stored; the content stays in
     Resend until approval.
5. Every attachment becomes its own document; the email body becomes one text
   document. Image attachments and inline images are skipped.
6. Mail that reached a division's address marks its documents for that
   division (`document_divisions`). The chat shows each document's division
   to the model, which then applies the document only to that division.
   Mail to the whole-school address adds no division.
7. During processing, the AI classifier assigns each unsorted document a
   category and folder from that school's existing lists. Once a school uses
   division categories (Documents → Manage Categories → Set up division
   categories), mail that reached a division's address is filed only into
   that division's categories, landing in its "Other" when nothing else fits,
   and a document's division always follows its category.

Every attempt (accepted / held / rejected / error) is logged in the
`email_ingestions` table. The latest 20, plus every email still waiting for
review, are shown to admins under
**Admin → Settings → Email Ingestion → Recent emails**.

## Reviewing held emails

When a school has no allowed sender domains, each incoming email shows up in
**Recent emails** as **Needs review** with **Approve** / **Reject** buttons.
Parents see nothing from it until it is approved.

- **Approve** fetches the email from Resend by its id and ingests it exactly
  like an allowlisted email (body + attachments, divisions, processing). The
  row moves `pending_review → processing → accepted`; the conditional update
  means two admins approving at once can't ingest it twice. If fetching
  fails, the email goes back to **Needs review** with the error as its
  reason. Resend keeps received mail for 30 days, so approve within that
  window.
- **Reject** marks it `rejected_review`. Nothing was ingested.
- Both record `reviewed_by` / `reviewed_at` and write an audit log entry.
- Copies of a held email reaching other division addresses merge their
  divisions into the held row.

The recommended setup is still to set allowed domains, so school staff mail
is added without review and strangers are turned away.

Before creating any documents, the webhook claims the message with a
`processing` row. A second delivery of the same email (a Resend retry, or two
copies arriving at once) is skipped while that claim is held or once it is
`accepted`. If ingestion fails partway, the documents it already created are
deleted and the claim is released as `error`, so Resend's retry starts clean.
A claim left by an attempt that crashed expires after 10 minutes.

One email can reach two division addresses as separate deliveries with the
same message id, for example when the Lower and Middle School mailing lists
each forward their own copy. The first copy is ingested. A later copy is not
ingested again; it only adds its division to the documents the first copy
created. If the first copy is still being ingested, the later one gets a 409
so Resend retries it once the first has finished.

## One-time setup (what you need to do)

### 1. Run the migrations

Apply `supabase/migrations/019_email_ingestion.sql`,
`supabase/migrations/027_email_ingestion_claims.sql`,
`supabase/migrations/028_division_email_addresses.sql`,
`supabase/migrations/029_division_categories.sql` and
`supabase/migrations/032_email_ingestion_review.sql` to your database.
032 adds the review statuses and columns. Until it is applied, mail to a
school without allowed domains fails closed: nothing is ingested, and the
webhook returns 500 so Resend retries for up to 24 hours.
028 copies each school's existing address into `email_ingestion_addresses`,
so addresses already in use keep working. Apply it before deploying the code
that reads that table.

### 2. Environment variables

Set these (see `.env.local.example`):

| Var | What it is |
| --- | --- |
| `RESEND_API_KEY` | Your Resend API key (already used for outbound email). |
| `RESEND_INBOUND_SECRET` | The signing secret Resend shows when you create the inbound webhook. |
| `INBOUND_EMAIL_DOMAIN` | The subdomain that receives mail, e.g. `inbound.askmyschool.app`. |
| `NEXT_PUBLIC_APP_URL` | Your deployed app URL (used to kick off processing). |

### 3. DNS — add the MX record

In your DNS provider, on the subdomain you chose for `INBOUND_EMAIL_DOMAIN`
(e.g. `inbound.askmyschool.app`), add the **MX record Resend gives you** in the
dashboard under **Domains → (your domain) → Receiving**. This routes incoming
mail to Resend.

### 4. Resend — create the inbound webhook

In the Resend dashboard:

1. Go to **Webhooks → Add Webhook**.
2. Endpoint URL: `https://<your-app>/api/inbound-email`.
3. Select the **`email.received`** event.
4. Copy the **signing secret** into `RESEND_INBOUND_SECRET`.

### 5. Per-school configuration (admin UI)

Each school admin, under **Admin → Settings → Email Ingestion**:

1. Toggle **Enable email ingestion** and save (this generates the
   whole-school address).
2. Add **allowed sender domains** (e.g. `lincolnhigh.org`). Subdomains like
   `mail.lincolnhigh.org` are matched automatically. With the list empty,
   every email is held under **Recent emails** for an admin to approve.
3. Copy the **inbound address** and forward school emails to it.
4. Optionally pick a division under **Your inbound addresses** to give it its
   own address, e.g. one each for Lower, Middle and Upper School, and forward
   that division's emails there. Divisions are the ones set up for the
   calendar under **Events**. Removing a division's address makes mail to it
   be turned away; documents it already added keep their division.
5. Optionally toggle **Auto-sort** (on by default).

## Notes

- The random address token is always required. Allowed domains are the second
  gate; without them, every email waits for admin approval, so someone who
  learns the address can't add documents parents see.
- Sender domains come from the `From` header, which can be spoofed. Together
  with the private address it is a reasonable gate, but SPF/DKIM checks are
  not enforced here.
- Auto-sort runs for **any** unsorted document (emailed or manually uploaded)
  when the school has it enabled; it never overwrites a category/folder that was
  set manually, and never invents new categories/folders.
- Rejected/errored emails are recorded in `email_ingestions` but produce no
  documents.
- Documents that arrived by email show an **Emailed** badge in the documents
  list, and a badge for each division they are marked for. Admins can change a
  document's divisions in its **Edit** dialog, uploaded documents included.
- Deleting a division under Events also deletes its inbound address and
  removes that division from documents.
