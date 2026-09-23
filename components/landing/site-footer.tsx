import Link from "next/link";
import { Logo } from "@/components/logo";

const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { label: "See it in action", href: "#demo" },
      { label: "How it works", href: "#grounded" },
      { label: "For families", href: "#families" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create an account", href: "/register" },
    ],
  },
];

const LINK_CLASS = "text-sm text-muted-foreground transition-colors hover:text-ink";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-12 sm:py-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
        <div>
          <div className="flex items-center gap-2">
            <Logo size={20} className="text-brand-dark" />
            <span className="text-base tracking-tight text-brand-dark">AskMySchool</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            An assistant that answers parents&apos; questions from the
            school&apos;s own documents, calendar, and announcements.
          </p>
        </div>
        {FOOTER_LINKS.map((group) => (
          <div key={group.heading}>
            <p className="text-sm font-semibold text-ink">{group.heading}</p>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("#") ? (
                    <a href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-border px-6 pt-6">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} AskMySchool. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
