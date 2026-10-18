// The sign-in code email. Pure (no I/O) so its content and escaping are
// unit tested. No links, images or tracking: just the code.

export const LOGIN_CODE_SUBJECT = "Your Ask My School sign-in code";

export function loginCodeFromAddress(): string {
  return (
    process.env.AUTH_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Ask My School <noreply@askmyschool.app>"
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildLoginCodeEmail(input: { code: string; schoolName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const school = input.schoolName.trim() || "your school";
  const safeSchool = escapeHtml(school);
  const safeCode = escapeHtml(input.code);

  const text = [
    `${input.code} is your Ask My School sign-in code.`,
    "",
    `Enter it on the ${school} sign-in page. It expires in 10 minutes.`,
    "",
    "If you didn't ask for this, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1d1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;font-size:16px;">Your Ask My School sign-in code for ${safeSchool}:</p>
      <p style="margin:16px 0;font-size:36px;font-weight:700;letter-spacing:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;" aria-label="Sign-in code ${safeCode.split("").join(" ")}">${safeCode}</p>
      <p style="margin:0 0 16px;font-size:15px;">It expires in 10 minutes.</p>
      <p style="margin:0;font-size:13px;color:#6b665e;">If you didn't ask for this, you can ignore this email.</p>
    </div>
  </body>
</html>`;

  return { subject: LOGIN_CODE_SUBJECT, html, text };
}
