"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { animate, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/logo";
import {
  formatCount,
  formatEtTime,
  formatRate,
  sparklinePaths,
  type WallStats,
} from "@/lib/wall/aggregate";
import styles from "./wall.module.css";

const REFRESH_MS = 60_000;

// Sizes are in "u": 1% of the screen height, capped by width so an unusual
// aspect ratio still fits. Desktop is laid out for 16:10, phone for ~9:19.5.
const DESKTOP_U = "min(1dvh, 0.625dvw)";
const PHONE_U = "min(1dvh, 2.15dvw)";
const u = (n: number) => `calc(var(--u) * ${n})`;

// A few motes drifting up; fixed positions so server and client agree.
const PARTICLES = [
  { left: "12%", top: "78%", delay: "0s", duration: "38s" },
  { left: "27%", top: "92%", delay: "-9s", duration: "46s" },
  { left: "44%", top: "84%", delay: "-21s", duration: "41s" },
  { left: "61%", top: "96%", delay: "-4s", duration: "52s" },
  { left: "73%", top: "80%", delay: "-30s", duration: "44s" },
  { left: "86%", top: "90%", delay: "-15s", duration: "49s" },
  { left: "35%", top: "70%", delay: "-26s", duration: "56s" },
  { left: "92%", top: "72%", delay: "-38s", duration: "40s" },
];

export type WallLayoutMode = "auto" | "desktop" | "phone";

export function WallDashboard({ stats, layout }: { stats: WallStats; layout: WallLayoutMode }) {
  const router = useRouter();

  // Re-render the server component every minute (and when the screen wakes)
  // for fresh numbers; the URL, and so the token, stays as it is.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <main
      className={`${styles.root} fixed inset-0 z-[100] h-dvh w-dvw overflow-hidden select-none`}
      aria-label="AskMySchool live stats"
    >
      <Background />
      {layout !== "phone" && (
        <div className={layout === "auto" ? "contents portrait:hidden" : "contents"}>
          <DesktopLayout stats={stats} />
        </div>
      )}
      {layout !== "desktop" && (
        <div className={layout === "auto" ? "hidden portrait:contents" : "contents"}>
          <PhoneLayout stats={stats} />
        </div>
      )}
    </main>
  );
}

function Background() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`${styles.blob} ${styles.blobGreen}`} />
      <div className={`${styles.blob} ${styles.blobTeal}`} />
      <div className={`${styles.blob} ${styles.blobAmber}`} />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={styles.particle}
          style={{ left: p.left, top: p.top, animationDelay: p.delay, animationDuration: p.duration }}
        />
      ))}
      <div className={styles.vignette} />
      <div className={styles.grain} />
    </div>
  );
}

// --------------------------------------------
// Layouts
// --------------------------------------------

function DesktopLayout({ stats }: { stats: WallStats }) {
  return (
    <div className="absolute inset-0" style={{ "--u": DESKTOP_U } as CSSProperties}>
      {/* Below the macOS menu bar (~3%), clear of the centered clock. */}
      <div className="absolute flex items-center" style={{ top: "5%", left: "3.5%", gap: u(1.2) }}>
        <Brand size={2.4} />
      </div>
      <div className="absolute" style={{ top: "5%", right: "3.5%" }}>
        <Updated stats={stats} size={1.35} />
      </div>

      {/* Top ~22% (lock-screen clock) and bottom ~12% (dock) stay empty. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-center"
        style={{ top: "24%", bottom: "12%" }}
      >
        <Hero stats={stats} labelSize={2.1} numberSize={19} subSize={1.9} />
        <div className="flex items-stretch" style={{ marginTop: u(4.5), gap: u(1.6) }}>
          <StatTiles stats={stats} width={u(18)} />
          <SparklineTile stats={stats} style={{ width: u(30) }} />
        </div>
        <CollegiateLine stats={stats} size={1.35} />
      </div>
    </div>
  );
}

function PhoneLayout({ stats }: { stats: WallStats }) {
  return (
    <div className="absolute inset-0" style={{ "--u": PHONE_U } as CSSProperties}>
      {/* Top ~35% (iOS clock + widgets) and bottom ~16% (flashlight / camera,
          home indicator) stay empty. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-center"
        style={{ top: "35%", bottom: "16%" }}
      >
        <Hero stats={stats} labelSize={1.5} numberSize={9} subSize={1.4} />
        <div
          className="grid grid-cols-2"
          style={{ marginTop: u(2), gap: u(1), width: `min(86dvw, ${u(40)})` }}
        >
          <StatTiles stats={stats} compact />
        </div>
        <SparklineTile
          stats={stats}
          compact
          style={{ marginTop: u(1), width: `min(86dvw, ${u(40)})`, height: u(8.5), flexShrink: 0 }}
        />
        <div className="flex items-center justify-center" style={{ marginTop: u(1.4), gap: u(1.6) }}>
          <Brand size={1.5} />
          <Updated stats={stats} size={1.05} />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------
// Pieces
// --------------------------------------------

function Brand({ size }: { size: number }) {
  return (
    <span className="flex items-center text-[#faf8f5]/85" style={{ gap: u(size * 0.45) }}>
      <span className="flex" style={{ width: u(size * 2.16), height: u(size) }}>
        <Logo className="h-full w-full" />
      </span>
      <span className="font-medium tracking-tight" style={{ fontSize: u(size * 0.75) }}>
        AskMySchool
      </span>
    </span>
  );
}

function Updated({ stats, size }: { stats: WallStats; size: number }) {
  return (
    <span
      className="flex items-center uppercase text-[#faf8f5]/45"
      style={{ fontSize: u(size), letterSpacing: "0.14em", gap: u(size * 0.55) }}
    >
      <span
        className={`${styles.liveDot} inline-block rounded-full bg-[#7fc4a0]`}
        style={{ width: u(size * 0.5), height: u(size * 0.5), boxShadow: "0 0 8px rgba(127,196,160,0.9)" }}
      />
      Updated {formatEtTime(stats.generatedAt)} ET
    </span>
  );
}

function Hero({
  stats,
  labelSize,
  numberSize,
  subSize,
}: {
  stats: WallStats;
  labelSize: number;
  numberSize: number;
  subSize: number;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className="uppercase text-[#e8c48a]/80"
        style={{ fontSize: u(labelSize), letterSpacing: "0.32em", fontWeight: 500 }}
      >
        Parents on AskMySchool
      </span>
      <CountUp
        value={stats.totalParents}
        className={`${styles.heroNumber} font-serif-display tabular-nums`}
        style={{ fontSize: u(numberSize), marginTop: u(numberSize * 0.08) }}
      />
      <span className="text-[#faf8f5]/55" style={{ fontSize: u(subSize), marginTop: u(subSize * 0.6) }}>
        <span className="text-[#9fd8b8]">+{formatCount(stats.newParents7d)}</span> this week
        <span className="mx-[0.6em] text-[#faf8f5]/25">·</span>
        {formatCount(stats.schoolsCount)} {stats.schoolsCount === 1 ? "school" : "schools"}
      </span>
    </div>
  );
}

function StatTiles({ stats, width, compact }: { stats: WallStats; width?: string; compact?: boolean }) {
  const tiles: { label: string; value: number | null; format?: (n: number) => string; sub: string }[] = [
    { label: "Active parents", value: stats.activeParents7d, sub: "last 7 days" },
    { label: "Questions asked", value: stats.questionsTotal, sub: `${formatCount(stats.questionsToday)} today` },
    {
      label: "Answer rate",
      value: stats.answerRate,
      format: (n) => `${n}%`,
      sub: `last ${stats.answerRateDays} days`,
    },
    { label: "New today", value: stats.newParentsToday, format: (n) => `+${formatCount(n)}`, sub: "parents joined" },
  ];
  const s = compact ? 0.72 : 1;
  return (
    <>
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`${styles.tile} flex flex-col justify-between`}
          style={{ width, padding: `${u(1.7 * s)} ${u(2 * s)}`, borderRadius: u(1.8 * s) }}
        >
          <span
            className="uppercase text-[#faf8f5]/50"
            style={{ fontSize: u(1.2 * s), letterSpacing: "0.12em", fontWeight: 500 }}
          >
            {t.label}
          </span>
          {t.value === null ? (
            <span className="font-light text-[#fdf6e8]" style={{ fontSize: u(4.4 * s), lineHeight: 1.1 }}>
              {formatRate(null)}
            </span>
          ) : (
            <CountUp
              value={t.value}
              format={t.format}
              className="font-light tabular-nums tracking-tight text-[#fdf6e8]"
              style={{
                fontSize: u(4.4 * s),
                lineHeight: 1.1,
                marginTop: u(0.5 * s),
                textShadow: "0 0 0.5em rgba(232,184,109,0.25)",
              }}
            />
          )}
          <span className="text-[#faf8f5]/38" style={{ fontSize: u(1.1 * s) }}>
            {t.sub}
          </span>
        </div>
      ))}
    </>
  );
}

const SPARK_W = 200;
const SPARK_H = 60;

function SparklineTile({ stats, compact, style }: { stats: WallStats; compact?: boolean; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const values = stats.sparkline.map((d) => d.count);
  const { line, area, points } = sparklinePaths(values, SPARK_W, SPARK_H, 3);
  const last = points[points.length - 1];
  const s = compact ? 0.72 : 1;
  return (
    <div
      className={`${styles.tile} flex flex-col`}
      style={{ padding: `${u(1.7 * s)} ${u(2 * s)}`, borderRadius: u(1.8 * s), ...style }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="uppercase text-[#faf8f5]/50"
          style={{ fontSize: u(1.2 * s), letterSpacing: "0.12em", fontWeight: 500 }}
        >
          Questions / day
        </span>
        <span className="text-[#faf8f5]/38" style={{ fontSize: u(1.1 * s) }}>
          {stats.sparkline.length} days
        </span>
      </div>
      <div className="relative min-h-0 flex-1" style={{ marginTop: u(1 * s) }}>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${id}-stroke`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#3d7a5e" />
              <stop offset="70%" stopColor="#9fd8b8" />
              <stop offset="100%" stopColor="#f0c27b" />
            </linearGradient>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7fc4a0" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#7fc4a0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id}-fill)`} />
          <path
            d={line}
            fill="none"
            stroke={`url(#${id}-stroke)`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {last && (
          <span
            className="absolute rounded-full bg-[#f6d39a]"
            style={{
              left: `${(last.x / SPARK_W) * 100}%`,
              top: `${(last.y / SPARK_H) * 100}%`,
              width: u(0.9 * s),
              height: u(0.9 * s),
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 10px 2px rgba(240,194,123,0.7)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function CollegiateLine({ stats, size }: { stats: WallStats; size: number }) {
  const c = stats.collegiate;
  // Only worth a line when there's more than one school to break out from.
  if (!c || stats.schoolsCount < 2) return null;
  const parts = [
    `${formatCount(c.parents)} parents`,
    `${formatCount(c.active7d)} active this week`,
    `${formatCount(c.questions)} questions`,
  ];
  if (c.answerRate !== null) parts.push(`${c.answerRate}% answered`);
  return (
    <span className="text-[#faf8f5]/40" style={{ fontSize: u(size), marginTop: u(2.4), letterSpacing: "0.02em" }}>
      <span className="text-[#e8c48a]/70">Collegiate School</span>
      {parts.map((p) => (
        <span key={p}>
          <span className="mx-[0.7em] text-[#faf8f5]/20">·</span>
          {p}
        </span>
      ))}
    </span>
  );
}

/**
 * Shows `value` immediately on first render (no count-from-zero on a
 * wallpaper), then eases from the old number to the new one when it changes.
 */
function CountUp({
  value,
  format = formatCount,
  className,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);

  useEffect(() => {
    const from = shown.current;
    if (from === value) return;
    if (reduceMotion) {
      shown.current = value;
      return;
    }
    const controls = animate(from, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        setDisplay(Math.round(v));
      },
      onComplete: () => {
        shown.current = value;
      },
    });
    return controls.stop;
  }, [value, reduceMotion]);

  return (
    <span className={className} style={style}>
      {format(reduceMotion ? value : display)}
    </span>
  );
}
