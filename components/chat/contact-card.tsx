import { Mail, Phone, UserRound } from "lucide-react";
import { mailtoHref, telHref, type ContactCardData } from "@/lib/contacts/directory";

/**
 * The staff contact an unanswered question was routed to. Every detail comes
 * from the school's approved contact row (the `data-contact` stream part),
 * never from the model's text. Plain mailto:/tel: links: the native app
 * leaves those to the system (lib/native/links.ts), so they open Mail and the
 * dialer in the iOS / Android web view as in a browser.
 */
export function ContactCard({ contact }: { contact: ContactCardData }) {
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;
  const subtitle = [contact.role, contact.division].filter(Boolean).join(" · ");

  return (
    <div className="max-w-md rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-ink-soft">
          <UserRound className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Who to contact
          </p>
          <p className="truncate text-[0.95rem] font-semibold text-ink">
            {contact.name || contact.role}
          </p>
          {contact.name && subtitle && (
            <p className="text-sm text-ink-soft">{subtitle}</p>
          )}
        </div>
      </div>

      {(email || phone) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {email && (
            <a
              href={email}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-background px-4 py-2 text-sm text-ink transition-colors hover:bg-secondary active:bg-secondary"
            >
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {phone && (
            <a
              href={phone}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-background px-4 py-2 text-sm text-ink transition-colors hover:bg-secondary active:bg-secondary"
            >
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{contact.phone}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
