# Email Ingestion

Forward school emails to a private per-school address and have their
attachments **and** body automatically ingested as documents, then auto-sorted
into categories and folders by AI.

## How it works

1. Each school gets a unique inbound address: `<token>@<INBOUND_EMAIL_DOMAIN>`
   (generated the first time an admin enables ingestion).
2. Resend receives mail at `INBOUND_EMAIL_DOMAIN` (via an MX record) and POSTs
   an `email.received` event to `/api/inbound-email`.
3. The webhook verifies the signature, resolves the school by the address
   token, and — if the school has set allowed domains — accepts the mail only
   when the sender's address ends with one of them. With no allowed domains,
   any sender is accepted.
4. Every attachment becomes its own document; the email body becomes one text
   document. Image attachments and inline images are skipped.
5. During processing, the AI classifier assigns each unsorted document a
   category and folder from that school's existing lists.

Every attempt (accepted / rejected / error) is logged in the
`email_ingestions` table, and the latest 20 are shown to admins under
**Admin → Settings → Email Ingestion → Recent emails**.

Before creating any documents, the webhook claims the message with a
`processing` row. A second delivery of the same email (a Resend retry, or two
copies arriving at once) is skipped while that claim is held or once it is
`accepted`. If ingestion fails partway, the documents it already created are
deleted and the claim is released as `error`, so Resend's retry starts clean.
A claim left by an attempt that crashed expires after 10 minutes.

## One-time setup (what you need to do)

### 1. Run the migrations

Apply `supabase/migrations/019_email_ingestion.sql` and
`supabase/migrations/027_email_ingestion_claims.sql` to your database.

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

1. Toggle **Enable email ingestion** (this generates the school's address).
2. Optionally add **allowed sender domains** (e.g. `lincolnhigh.org`).
   Subdomains like `mail.lincolnhigh.org` are matched automatically. Leave the
   list empty to accept mail from anyone who has the address.
3. Copy the **inbound address** and forward school emails to it.
4. Optionally toggle **Auto-sort** (on by default).

## Notes

- The random address token is always required. Allowed domains are an optional
  second gate; without them, anyone who learns the address can add documents.
- Auto-sort runs for **any** unsorted document (emailed or manually uploaded)
  when the school has it enabled; it never overwrites a category/folder that was
  set manually, and never invents new categories/folders.
- Rejected/errored emails are recorded in `email_ingestions` but produce no
  documents.
- Documents that arrived by email show an **Emailed** badge in the documents
  list.
