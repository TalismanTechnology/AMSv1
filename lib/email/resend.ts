import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const DEFAULT_FROM =
  process.env.EMAIL_FROM || "AskMySchool <noreply@askmyschool.com>";

/** The shared Resend client, or null when RESEND_API_KEY is unset. */
export function getResendClient(): Resend | null {
  return resend;
}

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

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Like sendEmail, but reports whether Resend accepted the message instead of
 * only logging, and supports a plain-text part and a per-message sender.
 * Used where the caller must know (sign-in codes).
 */
export async function sendEmailWithResult(message: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<SendEmailResult> {
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  try {
    const { error } = await resend.emails.send({
      from: message.from ?? DEFAULT_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (caught: unknown) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Unknown error" };
  }
}
