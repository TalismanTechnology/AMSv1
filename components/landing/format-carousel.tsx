"use client";

import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Check } from "lucide-react";
import { useStepPlayback } from "@/components/landing/step-playback";
import {
  CalendarPreview,
  DocxPreview,
  EmailPreview,
  PdfPreview,
  PptxPreview,
  ScanPreview,
  XlsxPreview,
  type PreviewProps,
} from "@/components/landing/format-previews";

// Step 01's visual: the formats a school actually uploads, each drawn as a
// miniature of the real thing rather than a filename. A document drops onto
// the pile, a scan beam reads it top to bottom, and the passages it finds
// fly out into the Extracted rail as the beam passes them. The counter
// ticks up to the passage count, then the next document lands on top.
// The tabs are real buttons with a countdown fill, so a visitor can jump to
// a format. Pauses when covered or off-screen; reduced motion waits for a
// click and shows each document already read.
//
// Only formats the ingestion pipeline accepts appear here (lib/documents/
// parser.ts plus the iCal calendar sync) — no image uploads.

const CYCLE_MS = 4800;
const READ_START_S = 0.55;
const READ_S = 1.7;
const READ_END_S = READ_START_S + READ_S;
/** When the beam is over each extract's source, as a fraction of the read. */
const EXTRACT_AT = [0.28, 0.55, 0.85];
/** When each preview marks what it picked out. */
const PICK_AT_S = READ_START_S + READ_S * 0.5;
const EASE = [0.16, 1, 0.3, 1] as const;

type Extract = { kind: string; text: string };

type Format = {
  ext: string;
  name: string;
  /** Muted brand color of the app that makes this format. */
  color: string;
  passages: number;
  extracts: [Extract, Extract, Extract];
  Preview: ComponentType<PreviewProps>;
};

const FORMATS: Format[] = [
  {
    ext: "PDF",
    name: "family-handbook.pdf",
    color: "#b5483a",
    passages: 212,
    extracts: [
      { kind: "heading", text: "Early Dismissal" },
      { kind: "policy", text: "Pickup ends 12:45 PM, main entrance" },
      { kind: "source", text: "Family Handbook · p.14" },
    ],
    Preview: PdfPreview,
  },
  {
    ext: "DOCX",
    name: "welcome-letter.docx",
    color: "#2f5d9e",
    passages: 9,
    extracts: [
      { kind: "title", text: "Welcome back, families!" },
      { kind: "greeting", text: "Letter to all families" },
      { kind: "list", text: "3 items kept as a list" },
    ],
    Preview: DocxPreview,
  },
  {
    ext: "XLSX",
    name: "lunch-menu.xlsx",
    color: "#2f7a4b",
    passages: 20,
    extracts: [
      { kind: "header row", text: "Day · Entrée · Side" },
      { kind: "row 4", text: "Wed · Veggie curry · Brown rice" },
      { kind: "row 6", text: "Fri · Cheese pizza · Garden salad" },
    ],
    Preview: XlsxPreview,
  },
  {
    ext: "PPTX",
    name: "curriculum-night.pptx",
    color: "#c0602b",
    passages: 14,
    extracts: [
      { kind: "slide title", text: "Curriculum Night" },
      { kind: "date", text: "Thu, Oct 8 · 6:30 PM" },
      { kind: "chart", text: "Bar chart · 4 values" },
    ],
    Preview: PptxPreview,
  },
  {
    ext: "SCAN",
    name: "field-trip-slip.pdf",
    color: "#6b5b95",
    passages: 3,
    extracts: [
      { kind: "heading · ocr", text: "Field Trip — Grade 3" },
      { kind: "logistics", text: "Bus leaves 8:30 AM" },
      { kind: "deadline", text: "Slip due Fri, Oct 9" },
    ],
    Preview: ScanPreview,
  },
  {
    ext: "EMAIL",
    name: "Fwd: Picture day moved",
    color: "#4a5a6a",
    passages: 2,
    extracts: [
      { kind: "subject", text: "Picture day moved to Thursday" },
      { kind: "sender", text: "Front office · Grade 2" },
      { kind: "update", text: "Now Thu, Oct 15 · retakes Nov 3" },
    ],
    Preview: EmailPreview,
  },
  {
    ext: "ICS",
    name: "school-calendar feed",
    color: "#3d5a3e",
    passages: 48,
    extracts: [
      { kind: "event", text: "Oct 8 · Curriculum Night" },
      { kind: "closure", text: "Oct 12 · No school" },
      { kind: "event", text: "Oct 15 · Picture day" },
    ],
    Preview: CalendarPreview,
  },
];

export function FormatCarousel() {
  const { ref, isPlaying, reduceMotion } = useStepPlayback<HTMLDivElement>();
  const [active, setActive] = useState(0);

  // Restarts whenever the active format changes, so a click gets a full
  // cycle before the carousel moves on.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % FORMATS.length), CYCLE_MS);
    return () => clearTimeout(id);
  }, [active, isPlaying]);

  const format = FORMATS[active];

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <FormatTabs active={active} isPlaying={isPlaying} onSelect={setActive} />

      <div
        className="relative h-[236px] overflow-hidden rounded-xl bg-[#f5f3ef] sm:h-[252px]"
        style={{
          backgroundImage: "radial-gradient(rgba(45,58,46,0.09) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
      >
        <DocumentPile format={format} reduceMotion={reduceMotion} />
        <ExtractRail format={format} reduceMotion={reduceMotion} />
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="flex min-w-0 items-center gap-2">
          <motion.span
            key={format.ext}
            className="shrink-0 rounded-[3px] px-1 py-px font-mono text-[8.5px] tracking-wide text-white"
            style={{ backgroundColor: format.color }}
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
          >
            {format.ext}
          </motion.span>
          <span className="truncate font-mono text-brand-dark/70">{format.name}</span>
        </span>
        <ReadStatus key={format.ext} passages={format.passages} color={format.color} reduceMotion={reduceMotion} />
      </div>
    </div>
  );
}

function FormatTabs({
  active,
  isPlaying,
  onSelect,
}: {
  active: number;
  isPlaying: boolean;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Document formats">
      {FORMATS.map((f, i) => {
        const isActive = i === active;
        return (
          <button
            key={f.ext}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(i)}
            className={`relative overflow-hidden rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-[color,border-color,transform] duration-300 active:scale-95 ${
              isActive
                ? "border-transparent text-white"
                : "border-brand-dark/15 text-brand-dark/60 hover:-translate-y-px hover:border-brand-dark/30 hover:text-brand-dark"
            }`}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: f.color }}
              initial={false}
              animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.5 }}
              transition={{ duration: 0.35, ease: EASE }}
            />
            {/* Countdown to the next format */}
            {isActive && isPlaying && (
              <motion.span
                key={`${active}`}
                aria-hidden
                className="absolute inset-y-0 left-0 w-full origin-left bg-white/25"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
              />
            )}
            <span className="relative">{f.ext}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The active document on a small pile, with the scan beam over it. */
function DocumentPile({ format, reduceMotion }: { format: Format; reduceMotion: boolean }) {
  return (
    <div className="absolute inset-3 sm:inset-4 sm:right-[41%]">
      {/* The pile underneath: already-indexed pages */}
      <div
        aria-hidden
        className="absolute inset-x-3 top-2 -bottom-1 rotate-[-2.5deg] rounded-lg border border-brand-dark/8 bg-white/60 shadow-[var(--lp-shadow-1)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-2 top-1 bottom-0 rotate-[1.8deg] rounded-lg border border-brand-dark/8 bg-white/80 shadow-[var(--lp-shadow-1)]"
      />

      <AnimatePresence initial={false}>
        <motion.div
          key={format.ext}
          className="absolute inset-0"
          initial={
            reduceMotion
              ? { opacity: 0, zIndex: 2 }
              : { opacity: 0, y: -46, x: 18, rotate: 5, scale: 1.06, zIndex: 2 }
          }
          animate={{ opacity: 1, y: 0, x: 0, rotate: 0, scale: 1, zIndex: 2 }}
          exit={
            reduceMotion
              ? { opacity: 0, zIndex: 1 }
              : { opacity: 0, y: 10, rotate: -3, scale: 0.93, zIndex: 1, transition: { duration: 0.55, ease: EASE } }
          }
          transition={{ duration: 0.7, ease: EASE }}
        >
          <format.Preview pickAt={reduceMotion ? null : PICK_AT_S} />
          {!reduceMotion && <ScanBeam color={format.color} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * A full-height layer slid down by transform: its bottom edge is the bright
 * beam, and everything above it is a faint wash marking what has been read.
 */
function ScanBeam({ color }: { color: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${color}00 0%, ${color}0f 70%, ${color}40 94%, ${color}cc 99%, ${color}00 100%)`,
        }}
        initial={{ y: "-100%", opacity: 1 }}
        animate={{ y: "0%", opacity: 0 }}
        transition={{
          y: { delay: READ_START_S, duration: READ_S, ease: [0.45, 0, 0.55, 1] },
          opacity: { delay: READ_END_S, duration: 0.6 },
        }}
      />
    </div>
  );
}

/** Where the parsed passages land, one per slot, as the beam reaches them. */
function ExtractRail({ format, reduceMotion }: { format: Format; reduceMotion: boolean }) {
  return (
    <div className="absolute top-4 right-4 bottom-4 hidden w-[calc(41%-1.75rem)] flex-col sm:flex">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-brand-dark/50">Extracted</p>
        <motion.span
          key={format.ext}
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: format.color }}
          initial={reduceMotion ? false : { opacity: 0.3 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.3, 1, 0.3, 1] }}
          transition={{ delay: READ_START_S, duration: READ_S }}
        />
      </div>
      <ol className="mt-2 flex flex-1 flex-col gap-1.5">
        {format.extracts.map((_, slot) => (
          <li key={slot} className="relative flex-1 rounded-lg border border-dashed border-brand-dark/12">
            <AnimatePresence initial={false}>
              <ExtractCard
                key={`${format.ext}-${slot}`}
                extract={format.extracts[slot]}
                color={format.color}
                delay={reduceMotion ? 0 : READ_START_S + READ_S * EXTRACT_AT[slot]}
                reduceMotion={reduceMotion}
              />
            </AnimatePresence>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExtractCard({
  extract,
  color,
  delay,
  reduceMotion,
}: {
  extract: Extract;
  color: string;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className="absolute -inset-px flex flex-col justify-center overflow-hidden rounded-lg border border-brand-dark/10 bg-white pr-2 pl-3 shadow-[var(--lp-shadow-1)]"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -44, scale: 0.9, rotate: -2 }}
      animate={{ opacity: 1, x: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, x: 14, transition: { duration: 0.25, delay: 0 } }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { delay, type: "spring", stiffness: 340, damping: 26, opacity: { delay, duration: 0.15 } }
      }
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} />
      {/* A flash on arrival, like a card being stamped */}
      {!reduceMotion && (
        <motion.span
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: color }}
          initial={{ opacity: 0.18 }}
          animate={{ opacity: 0 }}
          transition={{ delay: delay + 0.1, duration: 0.6 }}
        />
      )}
      <span className="relative font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color }}>
        {extract.kind}
      </span>
      <span className="relative mt-0.5 truncate text-[11px] leading-tight text-brand-dark">{extract.text}</span>
    </motion.div>
  );
}

function ReadStatus({
  passages,
  color,
  reduceMotion,
}: {
  passages: number;
  color: string;
  reduceMotion: boolean;
}) {
  const count = useMotionValue(reduceMotion ? passages : 0);
  const shown = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(count, passages, {
      delay: READ_START_S + 0.2,
      duration: READ_S,
      ease: [0.3, 0, 0.2, 1],
    });
    return () => controls.stop();
  }, [count, passages, reduceMotion]);

  const done = reduceMotion ? 0 : READ_END_S;
  // Both states share one grid cell, so the slot is always as wide as the
  // wider one and never pushes into the filename.
  return (
    <span className="inline-grid shrink-0 items-center justify-items-end">
      {!reduceMotion && (
        <motion.span
          className="[grid-area:1/1] inline-flex items-center gap-2 whitespace-nowrap text-brand-dark/50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: done, duration: 0.2 }}
        >
          <span className="relative h-1 w-12 overflow-hidden rounded-full bg-brand-dark/10">
            <motion.span
              className="absolute inset-0 origin-left rounded-full"
              style={{ backgroundColor: color }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: READ_START_S, duration: READ_S, ease: [0.45, 0, 0.55, 1] }}
            />
          </span>
          <span className="tabular-nums">
            <motion.span>{shown}</motion.span> found
          </span>
        </motion.span>
      )}
      <motion.span
        className="[grid-area:1/1] inline-flex items-center gap-1 whitespace-nowrap font-medium"
        style={{ color }}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: done, duration: 0.3, ease: EASE }}
      >
        <motion.span
          className="inline-flex"
          initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: done + 0.05, type: "spring", stiffness: 600, damping: 16 }}
        >
          <Check className="h-3.5 w-3.5" />
        </motion.span>
        Indexed · {passages} passages
      </motion.span>
    </span>
  );
}
