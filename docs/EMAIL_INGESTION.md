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
   token, and accepts the mail **only if** the sender's address ends with one
   of the school's allowed domains.
4. Every attachment becomes its own document; the email body becomes one text
   document. Image attachments and inline images are skipped.
5. During processing, the AI classifier assigns each unsorted document a
   category and folder from that school's existing lists.

Every attempt (accepted / rejected / error / duplicate) is logged in the
`email_ingestions` table for admin visibility and idempotency.

## One-time setup (what you need to do)

### 1. Run the migration

Apply `supabase/migrations/019_email_ingestion.sql` to your database.

### 2. Environment variables

Set these (see `.env.local.example`):

| Var | What it is |
| --- | --- |
| `RESEND_API_KEY` | Your Resend API key (already used for outbound email). |
| `RESEND_INBOUND_SECRET` | The signing secret Resend shows when you create the inbound webhook. |
| `INBOUND_EMAIL_DOMAIN` | The subdomain that receives mail, e.g. `inbound.askmyschool.com`. |
| `NEXT_PUBLIC_APP_URL` | Your deployed app URL (used to kick off processing). |

### 3. DNS — add the MX record

In your DNS provider, on the subdomain you chose for `INBOUND_EMAIL_DOMAIN`
(e.g. `inbound.askmyschool.com`), add the **MX record Resend gives you** in the
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
2. Add one or more **allowed sender domains** (e.g. `lincolnhigh.org`).
   Subdomains like `mail.lincolnhigh.org` are matched automatically.
3. Copy the **inbound address** and forward school emails to it.
4. Optionally toggle **Auto-sort** (on by default).

## Notes

- Only senders whose address ends with an allowed domain are accepted — this is
  the anti-spam gate. The random address token is a second layer.
- Auto-sort runs for **any** unsorted document (emailed or manually uploaded)
  when the school has it enabled; it never overwrites a category/folder that was
  set manually, and never invents new categories/folders.
- Rejected/errored emails are recorded in `email_ingestions` but produce no
  documents.
