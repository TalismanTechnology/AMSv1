"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/* ── Format previews for step 01 ──────────────────────────────────────────
   Each fills its slot (absolute inset) and is drawn from divs and text so it
   stays crisp at any size. Grey bars stand in for body copy; anything a
   reader would recognise a format by (headers, grids, slides) is real.

   Every preview marks what the parser picks out of it (a highlight sweeps,
   a row gets selected, calendar events pop in) at `pickAt` seconds after it
   mounts, timed to when the scan beam passes. `pickAt: null` renders the
   picked state immediately, for reduced motion. */

export type PreviewProps = { pickAt: number | null };

const EASE = [0.16, 1, 0.3, 1] as const;

/** Transition for a "picked" mark, `offset` seconds after the pick moment. */
function picked(pickAt: number | null, offset = 0, duration = 0.5) {
  return pickAt === null ? { duration: 0 } : { delay: pickAt + offset, duration, ease: EASE };
}

function Bars({ widths, className = "" }: { widths: number[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {widths.map((w, i) => (
        <div key={i} className="h-1.5 rounded-full bg-brand-dark/12" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden rounded-lg border border-brand-dark/10 bg-white shadow-[0_1px_2px_rgba(45,58,46,0.06),0_8px_24px_-12px_rgba(45,58,46,0.25)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PdfPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet className="mx-auto max-w-[300px]">
      <div className="flex h-full flex-col px-6 pt-5 pb-3">
        <p className="text-[8px] uppercase tracking-[0.2em] text-brand-dark/45">
          Family Handbook 2026–27
        </p>
        <p className="mt-2 text-[15px] leading-tight text-brand-dark" style={{ fontFamily: "Georgia, serif" }}>
          Early Dismissal
        </p>
        <Bars className="mt-3" widths={[96, 92, 88, 94]} />
        {/* Highlighter stroke swept left to right over the key sentence */}
        <motion.div
          className="mt-2 rounded-sm px-1 py-0.5 text-[9px] text-brand-dark/80"
          style={{
            backgroundImage: "linear-gradient(rgba(181,72,58,0.16), rgba(181,72,58,0.16))",
            backgroundRepeat: "no-repeat",
          }}
          initial={pickAt === null ? false : { backgroundSize: "0% 100%" }}
          animate={{ backgroundSize: "100% 100%" }}
          transition={picked(pickAt, 0, 0.7)}
        >
          Pickup ends at 12:45 PM at the main entrance.
        </motion.div>
        <Bars className="mt-2" widths={[90, 84, 60]} />
        <p className="mt-auto text-center text-[8px] text-brand-dark/40">14</p>
      </div>
    </Sheet>
  );
}

export function DocxPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet>
      <div className="flex items-center gap-2 bg-[#2f5d9e] px-3 py-1.5">
        {["File", "Home", "Insert", "Layout"].map((t) => (
          <span key={t} className="text-[8px] text-white/80">
            {t}
          </span>
        ))}
      </div>
      <div className="mx-auto mt-3 h-full max-w-[260px] rounded-t-sm bg-white px-5 pt-4 shadow-[0_0_0_1px_rgba(45,58,46,0.08)]">
        <p className="text-[13px] text-[#2f5d9e]" style={{ fontFamily: "Calibri, Carlito, sans-serif" }}>
          Welcome back, families!
        </p>
        <p className="mt-2 text-[9px] text-brand-dark/70">Dear Families,</p>
        <Bars className="mt-2" widths={[98, 94, 70]} />
        {/* The list is kept as a list: a bracket closes around it */}
        <div className="relative mt-2.5">
          <ul className="space-y-1.5">
            {[62, 74, 55].map((w, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <motion.span
                  className="h-1 w-1 rounded-full bg-[#2f5d9e]"
                  initial={pickAt === null ? false : { scale: 0.4, backgroundColor: "rgba(45,58,46,0.4)" }}
                  animate={{ scale: 1, backgroundColor: "#2f5d9e" }}
                  transition={picked(pickAt, i * 0.08, 0.3)}
                />
                <span className="h-1.5 rounded-full bg-brand-dark/12" style={{ width: `${w}%` }} />
              </li>
            ))}
          </ul>
          <motion.span
            aria-hidden
            className="absolute -inset-x-1.5 -inset-y-1 rounded-[3px] border border-dashed border-[#2f5d9e]"
            initial={pickAt === null ? false : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={picked(pickAt, 0.2, 0.45)}
          />
        </div>
      </div>
    </Sheet>
  );
}

const MENU = [
  ["Mon", "Baked ziti", "Caesar salad"],
  ["Tue", "Chicken tacos", "Black beans"],
  ["Wed", "Veggie curry", "Brown rice"],
  ["Thu", "Turkey wrap", "Apple slices"],
  ["Fri", "Cheese pizza", "Garden salad"],
];
const PICKED_ROW = 2;

export function XlsxPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet>
      <div className="flex items-center gap-2 bg-[#2f7a4b] px-3 py-1.5">
        <span className="rounded-sm bg-white/20 px-1.5 text-[8px] text-white">fx</span>
        <span className="text-[8px] text-white/85">=Lunch!B3</span>
      </div>
      <table className="w-full border-collapse text-left text-[9px] text-brand-dark/80">
        <thead>
          <tr className="bg-[#eef3ef] text-[8px] text-brand-dark/45">
            <th className="w-6 border border-brand-dark/10 font-normal" />
            {["A", "B", "C"].map((c) => (
              <th key={c} className="border border-brand-dark/10 px-1.5 py-0.5 text-center font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-[#2f7a4b]/10 font-medium text-brand-dark">
            <td className="border border-brand-dark/10 text-center text-[8px] font-normal text-brand-dark/45">1</td>
            <td className="border border-brand-dark/10 px-1.5 py-1">Day</td>
            <td className="border border-brand-dark/10 px-1.5 py-1">Entrée</td>
            <td className="border border-brand-dark/10 px-1.5 py-1">Side</td>
          </tr>
          {MENU.map((row, r) => {
            const isPicked = r === PICKED_ROW;
            return (
              <motion.tr
                key={row[0]}
                className={isPicked ? "outline outline-2 -outline-offset-2" : ""}
                initial={
                  pickAt === null || !isPicked
                    ? false
                    : { outlineColor: "rgba(47,122,75,0)", backgroundColor: "rgba(47,122,75,0)" }
                }
                animate={
                  isPicked
                    ? { outlineColor: "rgba(47,122,75,1)", backgroundColor: "rgba(47,122,75,0.08)" }
                    : undefined
                }
                transition={picked(pickAt, 0, 0.35)}
              >
                <td className="border border-brand-dark/10 text-center text-[8px] text-brand-dark/45">{r + 2}</td>
                {row.map((cell) => (
                  <td key={cell} className="truncate border border-brand-dark/10 px-1.5 py-1">
                    {cell}
                  </td>
                ))}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}

const SLIDE_BARS = [40, 65, 50, 85];

export function PptxPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet className="bg-[#efece7]">
      <div className="flex h-full gap-2 p-2.5">
        <div className="hidden w-14 shrink-0 flex-col gap-1.5 sm:flex">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`aspect-video rounded-[3px] bg-white ${
                i === 1 ? "ring-2 ring-[#c0602b]" : "ring-1 ring-brand-dark/10"
              }`}
            />
          ))}
        </div>
        <div className="relative flex flex-1 items-center">
          <div className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-white shadow-[0_2px_10px_-4px_rgba(45,58,46,0.3)]">
            <div className="absolute inset-y-0 left-0 w-1.5 bg-[#c0602b]" />
            <div className="flex h-full gap-3 py-[7%] pr-[6%] pl-[9%]">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-tight text-brand-dark sm:text-[15px]">Curriculum Night</p>
                <p className="mt-0.5 text-[8px] text-[#c0602b]">Thursday, Oct 8 · 6:30 PM</p>
                <ul className="mt-2.5 space-y-1.5">
                  {[80, 64, 72].map((w, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-[#c0602b]" />
                      <span className="h-1.5 rounded-full bg-brand-dark/12" style={{ width: `${w}%` }} />
                    </li>
                  ))}
                </ul>
              </div>
              {/* Chart values are read, so the bars build as the beam crosses */}
              <div className="flex w-[34%] items-end">
                <div className="flex h-[72%] w-full items-end gap-1 rounded-sm bg-[#c0602b]/10 p-1.5">
                  {SLIDE_BARS.map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 origin-bottom rounded-t-[2px] bg-[#c0602b]/70"
                      style={{ height: `${h}%` }}
                      initial={pickAt === null ? false : { scaleY: 0.08 }}
                      animate={{ scaleY: 1 }}
                      transition={picked(pickAt, i * 0.08, 0.6)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

const TYPEWRITER = { fontFamily: "'Courier New', monospace" };

export function ScanPreview({ pickAt }: PreviewProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="relative h-[94%] w-[76%] max-w-[280px] rotate-[-2.5deg] overflow-hidden rounded-[2px] bg-[#fbf9f2] px-5 pt-4 shadow-[0_10px_24px_-10px_rgba(45,58,46,0.45)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(0,0,0,0.035), transparent 45%), radial-gradient(circle at 85% 90%, rgba(0,0,0,0.05), transparent 50%)",
        }}
      >
        <p className="text-center text-[17px] tracking-wide text-brand-dark/85" style={TYPEWRITER}>
          FIELD TRIP!
        </p>
        <p className="mt-1 text-center text-[9px] text-brand-dark/70" style={TYPEWRITER}>
          Grade 3 · Museum of Natural History
        </p>
        <div className="relative mt-3">
          <p className="text-[9px] leading-relaxed text-brand-dark/75" style={TYPEWRITER}>
            Bus leaves 8:30 AM. Pack a lunch.
            <br />
            Permission slip due Fri, Oct 9.
          </p>
          {/* What the vision model picked out of the scan: a box snaps shut
              around the deadline, then gets its label */}
          <motion.span
            className="absolute top-[52%] left-[-3px] h-[46%] w-[88%] rounded-[2px] border border-dashed border-[#6b5b95]"
            initial={pickAt === null ? false : { opacity: 0, scale: 1.25 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={picked(pickAt, 0, 0.45)}
          />
          <motion.span
            className="absolute top-[102%] left-[-3px] rounded-[2px] bg-[#6b5b95] px-1 font-mono text-[7px] uppercase tracking-wider text-white"
            initial={pickAt === null ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={picked(pickAt, 0.3, 0.3)}
          >
            deadline
          </motion.span>
        </div>
        <div className="mt-5 border-t border-dashed border-brand-dark/30 pt-2">
          <p className="text-[8px] text-brand-dark/60" style={TYPEWRITER}>
            ✂ Student name ____________ Parent signature ____________
          </p>
        </div>
      </div>
    </div>
  );
}

export function EmailPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet>
      <div className="border-b border-brand-dark/10 px-4 pt-3 pb-2.5">
        <p className="text-[12px] text-brand-dark">Fwd: Picture day moved to Thursday</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4a5a6a] text-[8px] text-white">
            MR
          </span>
          <div className="text-[8px] leading-tight text-brand-dark/60">
            <p>
              <span className="text-brand-dark/85">Ms. Rivera</span> &lt;front-office@school.org&gt;
            </p>
            <p>to Parents · Grade 2</p>
          </div>
        </div>
      </div>
      <div className="px-4 pt-3">
        <Bars widths={[92, 86]} />
        {/* The forwarded part is what counts: its rule darkens and the
            new date gets underlined */}
        <motion.div
          className="mt-2.5 border-l-2 pl-2.5"
          initial={pickAt === null ? false : { borderLeftColor: "rgba(45,58,46,0.15)" }}
          animate={{ borderLeftColor: "rgba(74,90,106,1)" }}
          transition={picked(pickAt, 0, 0.4)}
        >
          <p className="text-[8px] text-brand-dark/45">---------- Forwarded message ----------</p>
          <p className="mt-1 text-[9px] text-brand-dark/75">
            Picture day is now{" "}
            <span className="relative whitespace-nowrap">
              Thursday, Oct 15
              <motion.span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-px origin-left bg-[#4a5a6a]"
                initial={pickAt === null ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={picked(pickAt, 0.15, 0.5)}
              />
            </span>
            . Retakes Nov 3.
          </p>
          <Bars className="mt-1.5" widths={[78, 64]} />
        </motion.div>
      </div>
    </Sheet>
  );
}

// October 2026 starts on a Thursday.
const OCT_OFFSET = 4;
const OCT_EVENTS: Record<number, string> = { 8: "#c0602b", 12: "#b5483a", 15: "#3d5a3e", 23: "#2f5d9e" };
const OCT_EVENT_DAYS = Object.keys(OCT_EVENTS).map(Number);

export function CalendarPreview({ pickAt }: PreviewProps) {
  return (
    <Sheet>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-[12px] text-brand-dark">October 2026</p>
        <span className="rounded-full bg-[#3d5a3e]/10 px-2 py-0.5 text-[8px] text-[#3d5a3e]">Synced 2m ago</span>
      </div>
      <div className="grid grid-cols-7 gap-px px-3 text-center text-[8px] text-brand-dark/40">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1">
            {d}
          </span>
        ))}
        {Array.from({ length: OCT_OFFSET + 31 }, (_, i) => {
          const day = i - OCT_OFFSET + 1;
          if (day < 1) return <span key={i} />;
          const dot = OCT_EVENTS[day];
          const isClosed = day === 12;
          const order = OCT_EVENT_DAYS.indexOf(day);
          return (
            <span
              key={i}
              className={`relative flex h-[22px] flex-col items-center justify-center rounded-[3px] text-[9px] ${
                isClosed ? "text-[#b5483a]" : "text-brand-dark/70"
              }`}
            >
              {isClosed && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-[3px] bg-[#b5483a]/12"
                  initial={pickAt === null ? false : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={picked(pickAt, 0.1, 0.4)}
                />
              )}
              <span className="relative">{day}</span>
              {dot && (
                <motion.span
                  className="relative mt-0.5 h-1 w-1 rounded-full"
                  style={{ backgroundColor: dot }}
                  initial={pickAt === null ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={
                    pickAt === null
                      ? { duration: 0 }
                      : { delay: pickAt - 0.3 + order * 0.14, type: "spring", stiffness: 600, damping: 14 }
                  }
                />
              )}
            </span>
          );
        })}
      </div>
      <motion.p
        className="px-4 pt-1.5 text-[8px] text-[#b5483a]"
        initial={pickAt === null ? false : { opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={picked(pickAt, 0.3, 0.4)}
      >
        Oct 12 · No school — Indigenous Peoples&apos; Day
      </motion.p>
    </Sheet>
  );
}
