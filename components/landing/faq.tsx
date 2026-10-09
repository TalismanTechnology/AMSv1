"use client";

import { Accordion } from "radix-ui";
import { ChevronDown } from "lucide-react";

// Answers are grounded in what the product does today: retrieval over
// approved documents, the "say so if it isn't there" rule in the answer
// prompt, per-school row-level security, and Blackbaud parent sign-in.
// Schools are set up by request; there is no self-serve sign-up.
const FAQS = [
  {
    q: "How does it know the answer?",
    a: "It searches your school's approved documents, calendar, and announcements for the passages that match your question, then writes an answer only from what it found. Every fact carries a numbered citation back to the source.",
  },
  {
    q: "What if the answer isn't in the documents?",
    a: "It tells you. Rather than guess, the assistant says the information isn't covered and points you to the school office. It never invents contact details, dates, or policies.",
  },
  {
    q: "Who can use it?",
    a: "Parents and guardians at a participating school. You sign in with the same Blackbaud login you use for your school's parent portal, so there's no separate account to create.",
  },
  {
    q: "Is my school's information private?",
    a: "Yes. Every document is scoped to its school with row-level security, so parents only ever retrieve from what their own school has approved. Drafts, staff memos, and unpublished files stay out of reach.",
  },
  {
    q: "Which files and sources are supported?",
    a: "PDF, Word, Excel, and PowerPoint, plus scanned handouts and images. Schools can also forward emails to a private inbound address, connect calendar feeds (including Blackbaud iCal), and post announcements — all of it becomes answerable.",
  },
  {
    q: "How does a school get set up?",
    a: "Schools are set up on request: get in touch using \"Bring it to your school\" below. Once the school's Blackbaud parent portal is connected, an admin uploads documents or forwards emails and adds calendar feeds, and parents sign in with their Blackbaud login. Documents are ready to answer from as soon as they finish processing, usually within minutes.",
  },
];

export function Faq() {
  return (
    <Accordion.Root type="single" collapsible className="border-t border-border">
      {FAQS.map((item, i) => (
        <Accordion.Item
          key={item.q}
          value={`faq-${i}`}
          className="border-b border-border"
        >
          <Accordion.Header asChild>
            <h3 className="m-0">
              <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium text-ink transition-colors hover:text-brand-green sm:py-6 sm:text-lg">
                {item.q}
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </Accordion.Trigger>
            </h3>
          </Accordion.Header>
          <Accordion.Content className="lp-acc-content overflow-hidden">
            <p className="max-w-3xl pb-6 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {item.a}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
