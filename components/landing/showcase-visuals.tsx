"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  FileText,
  Megaphone,
  Send,
} from "lucide-react";

// Two product visuals built for the showcase cards. Everything here is
// self-contained UI with fixed colors for the surface it sits on: AskVisual
// lives on the forest accent tile (a white composer over dark green),
// SourcesVisual on a white one.

const QUESTIONS = [
  "What time does pickup end on early-dismissal days?",
  "Is there a late bus on Wednesdays?",
  "What's the dress code on spirit days?",
  "When are parent–teacher conferences?",
];

const SUGGESTIONS = ["When is spring break?", "Nut-free lunch rules?", "Snow day policy?"];

const TYPE_MS = 38;
const HOLD_MS = 2200;
const CLEAR_MS = 420;

/**
 * Cycles through sample questions with a typewriter, so the card reads as
 * someone actually asking. Renders the first question fully typed when the
 * viewer prefers reduced motion — same SSR-safe pattern as the demo: state
 * starts on the static frame and only the client effect advances it.
 */
function useTypedQuestion() {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState(QUESTIONS[0]);

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    let timer = 0;
    let index = 0;

    const schedule = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const typeNext = () => {
      index = (index + 1) % QUESTIONS.length;
      const target = QUESTIONS[index];
      let cursor = 0;
      const tick = () => {
        cursor += 1;
        setText(target.slice(0, cursor));
        if (cursor < target.length) {
          schedule(TYPE_MS, tick);
        } else {
          schedule(HOLD_MS, () => {
            setText("");
            schedule(CLEAR_MS, typeNext);
          });
        }
      };
      schedule(0, tick);
    };

    schedule(HOLD_MS, () => {
      setText("");
      schedule(CLEAR_MS, typeNext);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduceMotion]);

  return text;
}

/** Oversized composer with suggestion chips — the "ask anything" card. */
export function AskVisual() {
  const typed = useTypedQuestion();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <span
            key={s}
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85"
          >
            {s}
          </span>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.45)] sm:p-5">
        <p className="min-h-[3.2em] text-[15px] leading-relaxed text-brand-dark sm:text-base">
          {typed}
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1.05em] w-[1.5px] translate-y-[0.18em] bg-brand-dark/70 motion-safe:animate-pulse"
          />
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {["Handbook", "Calendar", "Announcements"].map((src) => (
              <span
                key={src}
                className="rounded-md bg-brand-light px-2 py-1 text-[11px] font-medium text-brand-dark/60"
              >
                {src}
              </span>
            ))}
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-dark text-white">
            <Send className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

const SOURCES = [
  {
    icon: FileText,
    title: "Family Handbook 2026",
    meta: "42 pages · indexed",
    status: "Ready",
  },
  {
    icon: CalendarDays,
    title: "Upper School Athletics",
    meta: "Synced from Blackbaud · iCal",
    status: "Synced nightly",
  },
  {
    icon: Megaphone,
    title: "Early dismissal Friday",
    meta: "Announcement · pinned",
    status: "Live",
  },
];

/** Three source rows: documents, a synced calendar, and an announcement. */
export function SourcesVisual() {
  return (
    <ul className="space-y-2.5">
      {SOURCES.map((source, i) => (
        <motion.li
          key={source.title}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.45, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 rounded-xl border border-brand-dark/10 bg-white px-3.5 py-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-dark">
            <source.icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-brand-dark">
              {source.title}
            </span>
            <span className="block truncate text-xs text-brand-dark/50">
              {source.meta}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-medium text-brand-dark/80">
            <span className="size-1.5 rounded-full bg-[#5aaf6f]" aria-hidden="true" />
            {source.status}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
