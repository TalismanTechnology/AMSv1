"use client";

import { Fragment, useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { usePhaseCycle } from "@/hooks/use-phase-cycle";
import { useStepPlayback } from "@/components/landing/step-playback";

// Step 03 visual, told in order:
//   1. the handbook is cut into overlapping chunks and #142 is picked out,
//   2. its words are read,
//   3. tokens drop into the encoder and a 768-d vector resolves (the readout
//      scrambles until it settles),
//   4. the chunk arcs into a map of meaning and settles among the other
//      attendance passages,
//   5. a parent's question that shares no words with it lands nearby,
//   6. a search radius grows from the question and nearest-neighbor lines
//      reach out, the closest one being the chunk,
//   7. similarity counts up, and the matching phrase lights up in the text.
// Then everything unwinds in place and the loop restarts.

// The chunk text, split around the phrase the question matches on
const CHUNK_BEFORE = ["…students", "must"];
const CHUNK_MATCH = ["arrive", "by", "8:00", "AM.", "Tardiness"];
const CHUNK_AFTER = ["is", "recorded", "after", "the", "first", "bell…"];

const HIGHLIGHT = "linear-gradient(rgba(61, 90, 62, 0.18), rgba(61, 90, 62, 0.18))";

// Encoded vector, shown as a diverging strip. Deterministic so SSR and
// client agree.
const VECTOR = Array.from({ length: 28 }, (_, i) =>
  Number((Math.sin(i * 1.9) * 0.6 + Math.cos(i * 0.7) * 0.4).toFixed(3))
);
const READOUT_DIMS = 4;

// Map of meaning, in viewBox units (200 × 140)
const CLUSTERS = [
  { label: "attendance", x: 62, y: 50 },
  { label: "lunch", x: 156, y: 34 },
  { label: "transport", x: 160, y: 110 },
  { label: "events", x: 44, y: 114 },
] as const;

const NEIGHBORS_PER_CLUSTER = 6;
const POINTS = CLUSTERS.map((c, ci) =>
  Array.from({ length: NEIGHBORS_PER_CLUSTER }, (_, i) => {
    const angle = i * 2.4 + ci;
    const radius = 7 + ((i * 5 + ci * 3) % 9);
    return {
      x: Number((c.x + Math.cos(angle) * radius).toFixed(2)),
      y: Number((c.y + Math.sin(angle) * radius * 0.8).toFixed(2)),
      r: i % 3 === 0 ? 2.1 : 1.6,
    };
  })
);

const CHUNK_POINT = { x: 72, y: 60 };
const QUERY_POINT = { x: 94, y: 76 };
const SEARCH_RADIUS = Math.hypot(CHUNK_POINT.x - QUERY_POINT.x, CHUNK_POINT.y - QUERY_POINT.y) + 5;
// Two runners-up from the attendance cluster, drawn fainter
const RUNNERS_UP = POINTS[0]
  .map((p) => ({ ...p, d: Math.hypot(p.x - QUERY_POINT.x, p.y - QUERY_POINT.y) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 2);
// The chunk's flight in from the encoder, off the left edge
const FLIGHT_PATH = `M -4 118 Q 22 20 ${CHUNK_POINT.x} ${CHUNK_POINT.y}`;
const SIMILARITY = 0.91;

// reset · chunk · read · encode · place · query · search · match · unwind
const PHASES = [450, 1000, 1200, 1400, 1200, 900, 1200, 3300, 900] as const;
const CHUNK = 1;
const READ = 2;
const ENCODE = 3;
const PLACE = 4;
const QUERY = 5;
const SEARCH = 6;
const MATCH = 7;
const UNWIND = 8;

const EASE = [0.16, 1, 0.3, 1] as const;

/** True from `from` until the loop starts unwinding. */
function reached(phase: number, from: number): boolean {
  return phase >= from && phase < UNWIND;
}

/* ── Left card: the chunk and its embedding ─────────────────────────────── */

const WINDOWS = [
  { id: "#141", left: 0, width: 40 },
  { id: "#142", left: 30, width: 40 },
  { id: "#143", left: 60, width: 40 },
] as const;
const PICKED_WINDOW = 1;

// The handbook as a strip, cut into overlapping windows: overlaps are
// where neighbouring chunks share text, so nothing is lost at a boundary.
function ChunkStrip({ phase }: { phase: number }) {
  const isCut = reached(phase, CHUNK);
  return (
    <div className="relative mt-2.5 h-7" aria-hidden>
      <div className="absolute inset-x-0 bottom-0 h-1.5 rounded-full bg-brand-dark/8" />
      {WINDOWS.map((w, i) => {
        const isPicked = i === PICKED_WINDOW;
        return (
          <motion.div
            key={w.id}
            className={`absolute bottom-0 flex h-6 items-start justify-center rounded-[4px] border pt-px font-mono text-[7.5px] ${
              isPicked ? "border-brand-green bg-brand-green/10 text-brand-green" : "border-brand-dark/15 text-ink-soft/70"
            }`}
            style={{ left: `${w.left}%`, width: `${w.width}%`, zIndex: isPicked ? 2 : 1 }}
            initial={false}
            animate={{
              opacity: isCut ? 1 : 0,
              y: isCut ? (isPicked ? -2 : 0) : 6,
              scale: isCut ? 1 : 0.9,
            }}
            transition={{ duration: 0.5, delay: isCut && phase === CHUNK ? i * 0.14 + (isPicked ? 0.3 : 0) : 0, ease: EASE }}
          >
            {w.id}
          </motion.div>
        );
      })}
    </div>
  );
}

// Words as inline-blocks so they can rise in; spaces stay plain text
// between them so wrapping and the highlight run are unaffected.
function ChunkWords({ words, offset, phase }: { words: string[]; offset: number; phase: number }) {
  const isRead = reached(phase, READ);
  return words.map((text, i) => (
    <Fragment key={text}>
      {i > 0 && " "}
      <motion.span
        className="inline-block"
        initial={false}
        animate={{ opacity: isRead ? 1 : 0.14, y: isRead ? 0 : 3 }}
        transition={{ duration: 0.4, delay: phase === READ ? (offset + i) * 0.07 : 0, ease: EASE }}
      >
        {text}
      </motion.span>
    </Fragment>
  ));
}

// Tokens falling from the text into the encoder while it runs
function TokenFlow({ isActive }: { isActive: boolean }) {
  return (
    <div className="pointer-events-none relative h-4" aria-hidden>
      {isActive &&
        Array.from({ length: 9 }, (_, i) => (
          <motion.span
            key={i}
            className="absolute top-0 h-1 w-1 rounded-full bg-brand-green"
            style={{ left: `${8 + ((i * 37) % 84)}%` }}
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: [-4, 14], opacity: [0, 1, 0] }}
            transition={{ duration: 0.55, delay: i * 0.09, repeat: 1, repeatDelay: 0.25, ease: "easeIn" }}
          />
        ))}
    </div>
  );
}

function formatDim(v: number): string {
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`;
}

const SETTLED_READOUT = VECTOR.slice(0, READOUT_DIMS).map(formatDim).join(", ");

// The first few dimensions, scrambling while encoding and settling after.
function VectorReadout({ phase, isPlaying }: { phase: number; isPlaying: boolean }) {
  const [scrambled, setScrambled] = useState<string | null>(null);
  const isEncoding = phase === ENCODE && isPlaying;

  useEffect(() => {
    if (!isEncoding) return;
    const id = setInterval(() => {
      setScrambled(
        Array.from({ length: READOUT_DIMS }, () => formatDim(Math.random() * 2 - 1)).join(", ")
      );
    }, 55);
    const settle = setTimeout(() => {
      clearInterval(id);
      setScrambled(null);
    }, 900);
    return () => {
      clearInterval(id);
      clearTimeout(settle);
      setScrambled(null);
    };
  }, [isEncoding]);

  const isEncoded = reached(phase, ENCODE);
  return (
    <motion.p
      className="mt-1.5 truncate font-mono text-[9px] tabular-nums text-ink-soft"
      initial={false}
      animate={{ opacity: isEncoded ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      [{scrambled ?? SETTLED_READOUT}, …]
    </motion.p>
  );
}

function ChunkCard({ phase, isPlaying }: { phase: number; isPlaying: boolean }) {
  const isEncoded = reached(phase, ENCODE);
  const isMatched = reached(phase, MATCH);
  return (
    <div className="flex flex-col rounded-xl border border-brand-dark/10 bg-brand-light/50 p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Chunk #142</p>
        <p className="font-mono text-[9.5px] text-ink-soft/70">handbook · p.14</p>
      </div>
      <ChunkStrip phase={phase} />
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">
        <ChunkWords words={CHUNK_BEFORE} offset={0} phase={phase} />{" "}
        {/* One highlighter stroke over the whole phrase, swept left to right.
            `clone` gives each wrapped line its own rounded ends. */}
        <motion.mark
          className="-mx-1 rounded-[4px] bg-transparent px-1 text-inherit [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
          style={{ backgroundImage: HIGHLIGHT, backgroundRepeat: "no-repeat" }}
          initial={false}
          animate={{ backgroundSize: isMatched ? "100% 100%" : "0% 100%" }}
          transition={{ duration: isMatched ? 0.7 : 0.3, delay: isMatched ? 0.5 : 0, ease: EASE }}
        >
          <ChunkWords words={CHUNK_MATCH} offset={CHUNK_BEFORE.length} phase={phase} />
        </motion.mark>{" "}
        <ChunkWords
          words={CHUNK_AFTER}
          offset={CHUNK_BEFORE.length + CHUNK_MATCH.length}
          phase={phase}
        />
      </p>

      <div className="mt-auto pt-1">
        <TokenFlow isActive={phase === ENCODE && isPlaying} />
        <div className="flex items-center justify-between">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft/80">embedding</p>
          <motion.p
            className="font-mono text-[9.5px] tabular-nums text-ink-soft/80"
            initial={false}
            animate={{ opacity: isEncoded ? 1 : 0 }}
          >
            768 dims
          </motion.p>
        </div>
        {/* Diverging strip around a zero axis: positive up, negative down.
            Bars wave in from the left; on a match they pulse once. */}
        <div className="relative mt-1.5 flex h-10 gap-[2px]" aria-hidden>
          <span className="absolute inset-x-0 top-1/2 h-px bg-brand-dark/15" />
          {VECTOR.map((v, i) => {
            const isPositive = v >= 0;
            return (
              <span key={i} className="relative flex-1">
                <motion.span
                  className={`absolute inset-x-0 rounded-[1px] ${isPositive ? "bottom-1/2 bg-brand-green" : "top-1/2 bg-brand-dark/30"}`}
                  style={{
                    height: `${Math.max(6, Math.abs(v) * 48)}%`,
                    transformOrigin: isPositive ? "50% 100%" : "50% 0%",
                  }}
                  initial={false}
                  animate={{
                    scaleY: isEncoded ? (phase === MATCH ? [1, 1.25, 1] : 1) : 0,
                  }}
                  transition={{
                    duration: phase === MATCH ? 0.5 : 0.45,
                    delay: phase === ENCODE ? 0.3 + i * 0.024 : phase === MATCH ? i * 0.015 : 0,
                    ease: EASE,
                  }}
                />
              </span>
            );
          })}
        </div>
        <VectorReadout phase={phase} isPlaying={isPlaying} />
      </div>
    </div>
  );
}

/* ── Right card: the map of meaning ─────────────────────────────────────── */

function Clusters({ phase, isPlaying }: { phase: number; isPlaying: boolean }) {
  const isPlaced = reached(phase, PLACE);
  return CLUSTERS.map((c, ci) => (
    // Each cluster breathes on its own slow cycle so the map feels alive
    <motion.g
      key={c.label}
      animate={isPlaying ? { y: [0, ci % 2 ? 1.6 : -1.6, 0] } : { y: 0 }}
      transition={{ duration: 4 + ci * 0.7, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.circle
        cx={c.x}
        cy={c.y}
        r={20}
        initial={false}
        animate={{
          fill: ci === 0 && isPlaced ? "rgba(61,90,62,0.11)" : "rgba(61,90,62,0.05)",
        }}
        transition={{ duration: 0.6, delay: ci === 0 && phase === PLACE ? 0.8 : 0 }}
      />
      <text
        x={c.x}
        y={c.y - 22}
        textAnchor="middle"
        className="font-mono"
        fill="var(--ink-soft)"
        style={{ fontSize: 6.5, letterSpacing: 0.4 }}
      >
        {c.label}
      </text>
      {POINTS[ci].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="rgba(45,58,46,0.35)" />
      ))}
    </motion.g>
  ));
}

function ChunkMarker({ phase }: { phase: number }) {
  const isPlaced = reached(phase, PLACE);
  const isLanding = phase === PLACE;
  return (
    <>
      {/* The flight path, drawn just ahead of the point */}
      <motion.path
        d={FLIGHT_PATH}
        fill="none"
        stroke="#3d5a3e"
        strokeWidth={0.6}
        strokeDasharray="1.5 2"
        initial={false}
        animate={{ pathLength: isPlaced ? 1 : 0, opacity: isLanding ? 0.7 : 0 }}
        transition={{
          pathLength: { duration: isPlaced ? 0.8 : 0, ease: EASE },
          opacity: { duration: 0.5, delay: isLanding ? 0 : 0.2 },
        }}
      />
      <motion.g
        initial={false}
        animate={
          isPlaced
            ? { x: 0, y: 0, opacity: 1, scale: 1 }
            : { x: -76, y: 58, opacity: 0, scale: 0.6 }
        }
        style={{ transformOrigin: `${CHUNK_POINT.x}px ${CHUNK_POINT.y}px`, transformBox: "view-box" }}
        transition={
          isPlaced
            ? {
                x: { duration: 0.8, ease: [0.33, 0, 0.2, 1] },
                y: { duration: 0.8, ease: [0.6, 0, 0.3, 1] },
                opacity: { duration: 0.2 },
                scale: { duration: 0.8, ease: EASE },
              }
            : { duration: 0.5 }
        }
      >
        {/* Landing ripple, and again on the match */}
        <motion.circle
          cx={CHUNK_POINT.x}
          cy={CHUNK_POINT.y}
          fill="none"
          stroke="#3d5a3e"
          strokeWidth={0.6}
          initial={false}
          animate={isLanding || phase === MATCH ? { r: [3, 15], opacity: [0.8, 0] } : { r: 3, opacity: 0 }}
          transition={{ duration: 0.9, delay: isLanding ? 0.75 : 0.2, ease: "easeOut" }}
        />
        <motion.circle
          cx={CHUNK_POINT.x}
          cy={CHUNK_POINT.y}
          fill="#3d5a3e"
          initial={false}
          animate={{ r: phase === MATCH ? 4.2 : 3.4 }}
          transition={{ type: "spring", stiffness: 400, damping: 12 }}
        />
        <circle cx={CHUNK_POINT.x} cy={CHUNK_POINT.y} r={1.2} fill="#fff" />
        <text
          x={CHUNK_POINT.x - 5.5}
          y={CHUNK_POINT.y + 1.8}
          textAnchor="end"
          className="fill-brand-dark font-mono"
          style={{ fontSize: 6 }}
        >
          #142
        </text>
      </motion.g>
    </>
  );
}

function QueryMarker({ phase }: { phase: number }) {
  const hasQuery = reached(phase, QUERY);
  return (
    <motion.g
      initial={false}
      animate={hasQuery ? { opacity: 1, y: 0 } : { opacity: 0, y: -16 }}
      transition={hasQuery ? { type: "spring", stiffness: 300, damping: 18 } : { duration: 0.4 }}
    >
      {/* Positioned by the plain SVG translate and centred on 0,0, so the
          rotation pivots on the query point without a CSS transform-origin */}
      <g transform={`translate(${QUERY_POINT.x} ${QUERY_POINT.y})`}>
        <motion.rect
          x={-2.8}
          y={-2.8}
          width={5.6}
          height={5.6}
          rx={1.2}
          fill="#f5f3ef"
          stroke="#2d3a2e"
          strokeWidth={0.8}
          initial={false}
          animate={{ rotate: hasQuery ? 45 : 0 }}
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </g>
      {/* Speech-bubble label, so it reads as a person's words */}
      <g transform={`translate(${QUERY_POINT.x + 6} ${QUERY_POINT.y - 5})`}>
        <rect width={88} height={10.5} rx={5.25} fill="#fff" stroke="rgba(45,58,46,0.18)" strokeWidth={0.5} />
        <text x={5} y={7.3} fill="var(--ink)" style={{ fontSize: 6.8 }}>
          “my kid’s running late?”
        </text>
      </g>
    </motion.g>
  );
}

function SearchLines({ phase }: { phase: number }) {
  const isSearching = reached(phase, SEARCH);
  const isMatched = reached(phase, MATCH);
  return (
    <>
      {/* Search radius sweeping out from the question */}
      <motion.circle
        cx={QUERY_POINT.x}
        cy={QUERY_POINT.y}
        fill="rgba(61,90,62,0.04)"
        stroke="rgba(61,90,62,0.45)"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        initial={false}
        animate={{ r: isSearching ? SEARCH_RADIUS : 0, opacity: isSearching ? (isMatched ? 0.35 : 1) : 0 }}
        transition={{ r: { duration: isSearching ? 0.9 : 0.4, ease: EASE }, opacity: { duration: 0.4 } }}
      />
      {RUNNERS_UP.map((p, i) => (
        <motion.line
          key={i}
          x1={QUERY_POINT.x}
          y1={QUERY_POINT.y}
          x2={p.x}
          y2={p.y}
          stroke="rgba(45,58,46,0.35)"
          strokeWidth={0.6}
          strokeDasharray="1.5 1.5"
          initial={false}
          animate={{ pathLength: isSearching ? 1 : 0, opacity: isSearching ? (isMatched ? 0.25 : 1) : 0 }}
          transition={{ duration: 0.5, delay: phase === SEARCH ? 0.35 + i * 0.12 : 0, ease: EASE }}
        />
      ))}
      <motion.line
        x1={QUERY_POINT.x}
        y1={QUERY_POINT.y}
        x2={CHUNK_POINT.x}
        y2={CHUNK_POINT.y}
        stroke="#3d5a3e"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: isSearching ? 1 : 0,
          opacity: isSearching ? 1 : 0,
          strokeWidth: isMatched ? 1.5 : 0.8,
        }}
        transition={{ duration: 0.6, delay: phase === SEARCH ? 0.6 : 0, ease: EASE }}
      />
    </>
  );
}

function MatchFooter({ phase }: { phase: number }) {
  const isMatched = reached(phase, MATCH);
  const similarity = useMotionValue(0);
  const shown = useTransform(similarity, (v) => v.toFixed(2));

  useEffect(() => {
    if (!isMatched) {
      similarity.set(0);
      return;
    }
    const controls = animate(similarity, SIMILARITY, { duration: 1.1, delay: 0.2, ease: [0.2, 0.7, 0.2, 1] });
    return () => controls.stop();
  }, [isMatched, similarity]);

  return (
    <motion.div
      className="flex items-center justify-between gap-2 border-t border-brand-dark/8 pt-2 font-mono text-[9.5px] uppercase tracking-wider"
      initial={false}
      animate={{ opacity: isMatched ? 1 : 0, y: isMatched ? 0 : 4 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <span className="text-ink-soft">
        shared words <span className="tabular-nums text-ink">0</span>
      </span>
      <motion.span
        className="rounded-full bg-brand-green px-2 py-0.5 tabular-nums text-white"
        initial={false}
        animate={isMatched ? { scale: [0.9, 1.08, 1] } : { scale: 0.9 }}
        transition={{ duration: 0.5, delay: 1.1 }}
      >
        cos <motion.span>{shown}</motion.span> · match
      </motion.span>
    </motion.div>
  );
}

function MeaningMap({ phase, isPlaying }: { phase: number; isPlaying: boolean }) {
  return (
    <div className="relative flex flex-col rounded-xl border border-brand-dark/10 bg-white p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Vector space · 768d</p>
      <svg
        viewBox="0 0 200 140"
        className="mt-1 w-full overflow-visible"
        role="img"
        aria-label="A parent's question lands next to the attendance passage it means, not the one it words-matches"
      >
        <Clusters phase={phase} isPlaying={isPlaying} />
        <SearchLines phase={phase} />
        <ChunkMarker phase={phase} />
        <QueryMarker phase={phase} />
      </svg>
      <MatchFooter phase={phase} />
    </div>
  );
}

export function EmbeddingsMockup() {
  const { ref, isPlaying, reduceMotion } = useStepPlayback<HTMLDivElement>();
  const cyclePhase = usePhaseCycle(PHASES, isPlaying);
  const phase = reduceMotion ? MATCH : cyclePhase;

  return (
    <div
      ref={ref}
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
    >
      <ChunkCard phase={phase} isPlaying={isPlaying} />
      <MeaningMap phase={phase} isPlaying={isPlaying} />
    </div>
  );
}
