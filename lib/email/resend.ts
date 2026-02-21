import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const DEFAULT_FROM =
  process.env.EMAIL_FROM || "AskMySchool <noreply@askmyschool.com>";

/**
 * Send an email via Resend. No-ops gracefully when RESEND_API_KEY is not set.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string
): Promise<void> {
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping email to ${Array.isArray(to) ? to.join(", ") : to}`
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    console.error("[email] Failed to send:", error);
  }
}
