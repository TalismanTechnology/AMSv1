// Static, Satori-compatible version of the /wall dashboard, rendered by
// app/wall.png. Flexbox only, inline styles, no animation — the glow is a
// text shadow and the aurora is radial gradients. Sizes mirror
// components/wall/wall-dashboard.tsx.

import { BODY_PATH, HEAD_PATH, LOGO_VIEWBOX } from "@/lib/logo-paths";
import {
  formatCount,
  formatEtTime,
  formatRate,
  sparklinePaths,
  type WallLayout,
  type WallStats,
} from "@/lib/wall/aggregate";

const INK = "#fdf6e8";
const MUTED = "rgba(250,248,245,0.5)";
const FAINT = "rgba(250,248,245,0.38)";
const AMBER = "rgba(232,196,138,0.85)";
const MINT = "#9fd8b8";

export function WallImage({ stats, w, h, layout }: { stats: WallStats; w: number; h: number; layout: WallLayout }) {
  // Same "u" as the live page: 1% of height, capped by width.
  const u = layout === "phone" ? Math.min(h / 100, (w / 100) * 2.15) : Math.min(h / 100, (w / 100) * 0.625);
  const vmax = Math.max(w, h) / 100;

  return (
    <div
      style={{
        width: w,
        height: h,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundImage: "linear-gradient(160deg, #07110d 0%, #0b1a14 55%, #081410 100%)",
        color: INK,
        fontFamily: "Liberation Sans",
      }}
    >
      <Blob size={90 * vmax} left={-25 * vmax} top={-20 * vmax} color="47,93,74" alpha={0.8} />
      <Blob size={60 * vmax} left={w * 0.3} top={h * 0.28} color="61,90,62" alpha={0.6} />
      <Blob size={70 * vmax} left={w - 48 * vmax} top={h - 42 * vmax} color="232,184,109" alpha={0.32} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          display: "flex",
          backgroundImage: "radial-gradient(ellipse at 50% 55%, rgba(3,8,6,0) 40%, rgba(3,8,6,0.65) 100%)",
        }}
      />
      {layout === "phone" ? <Phone stats={stats} u={u} h={h} w={w} /> : <Desktop stats={stats} u={u} h={h} w={w} />}
    </div>
  );
}

function Blob({ size, left, top, color, alpha }: { size: number; left: number; top: number; color: string; alpha: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        display: "flex",
        backgroundImage: `radial-gradient(circle at 50% 50%, rgba(${color},${alpha}) 0%, rgba(${color},${alpha * 0.33}) 35%, rgba(${color},0) 70%)`,
      }}
    />
  );
}

type PartProps = { stats: WallStats; u: number; w: number; h: number };

function Desktop({ stats, u, w, h }: PartProps) {
  const tileW = 18 * u;
  return (
    <>
      {/* Below the macOS menu bar, clear of the lock-screen clock. */}
      <div style={{ position: "absolute", top: h * 0.05, left: w * 0.035, display: "flex" }}>
        <Brand size={2.4 * u} />
      </div>
      <div
        style={{
          position: "absolute",
          top: h * 0.05,
          left: 0,
          width: w * 0.965,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Updated stats={stats} size={1.35 * u} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: h * 0.24,
          width: w,
          height: h * 0.64,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Hero stats={stats} label={2.1 * u} number={19 * u} sub={1.9 * u} />
        <div style={{ display: "flex", marginTop: 4.5 * u, gap: 1.6 * u }}>
          {tiles(stats).map((t) => (
            <Tile key={t.label} {...t} u={u} width={tileW} />
          ))}
          <Spark stats={stats} u={u} width={30 * u} height={12.6 * u} />
        </div>
        <Collegiate stats={stats} size={1.35 * u} u={u} />
      </div>
    </>
  );
}

function Phone({ stats, u, w, h }: PartProps) {
  const s = 0.72;
  const width = Math.min(w * 0.86, 40 * u);
  const gap = 1 * u;
  const tileW = (width - gap) / 2;
  const list = tiles(stats);
  return (
    // Top 35% (clock + widgets) and bottom 16% (buttons, home indicator) clear.
    <div
      style={{
        position: "absolute",
        left: 0,
        top: h * 0.35,
        width: w,
        height: h * 0.49,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Hero stats={stats} label={1.5 * u} number={9 * u} sub={1.4 * u} />
      <div style={{ display: "flex", flexWrap: "wrap", width, gap, marginTop: 2 * u }}>
        {list.map((t) => (
          <Tile key={t.label} {...t} u={u * s} width={tileW} />
        ))}
      </div>
      <div style={{ display: "flex", marginTop: gap }}>
        <Spark stats={stats} u={u * s} width={width} height={8.5 * u} />
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 1.4 * u, gap: 1.6 * u }}>
        <Brand size={1.5 * u} />
        <Updated stats={stats} size={1.05 * u} />
      </div>
    </div>
  );
}

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.45, color: "rgba(250,248,245,0.85)" }}>
      <svg width={size * 2.16} height={size} viewBox={LOGO_VIEWBOX} xmlns="http://www.w3.org/2000/svg">
        <g fill="rgba(250,248,245,0.85)">
          <path d={HEAD_PATH.d} transform={`translate(${HEAD_PATH.translateX},${HEAD_PATH.translateY})`} />
          <path d={BODY_PATH.d} transform={`translate(${BODY_PATH.translateX},${BODY_PATH.translateY})`} />
        </g>
      </svg>
      <span style={{ fontSize: size * 0.75, fontWeight: 700, letterSpacing: "-0.01em" }}>AskMySchool</span>
    </div>
  );
}

function Updated({ stats, size }: { stats: WallStats; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.55, fontSize: size, color: "rgba(250,248,245,0.45)", letterSpacing: "0.14em" }}>
      <div
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: size,
          backgroundColor: "#7fc4a0",
          boxShadow: "0 0 8px rgba(127,196,160,0.9)",
        }}
      />
      <span>{`UPDATED ${formatEtTime(stats.generatedAt)} ET`}</span>
    </div>
  );
}

function Hero({ stats, label, number, sub }: { stats: WallStats; label: number; number: number; sub: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: label, letterSpacing: "0.32em", color: AMBER }}>PARENTS ON ASKMYSCHOOL</span>
      <span
        style={{
          fontSize: number,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginTop: number * 0.08,
          color: INK,
          textShadow: `0 0 ${number * 0.08}px rgba(255,228,176,0.55), 0 0 ${number * 0.3}px rgba(232,184,109,0.35), 0 0 ${number * 0.8}px rgba(47,93,74,0.9)`,
        }}
      >
        {formatCount(stats.totalParents)}
      </span>
      <div style={{ display: "flex", fontSize: sub, marginTop: sub * 0.6, color: "rgba(250,248,245,0.55)" }}>
        <span style={{ color: MINT }}>{`+${formatCount(stats.newParents7d)}`}</span>
        <span style={{ marginLeft: sub * 0.3 }}>this week</span>
        <span style={{ margin: `0 ${sub * 0.6}px`, color: "rgba(250,248,245,0.25)" }}>·</span>
        <span>{`${formatCount(stats.schoolsCount)} ${stats.schoolsCount === 1 ? "school" : "schools"}`}</span>
      </div>
    </div>
  );
}

function tiles(stats: WallStats) {
  return [
    { label: "ACTIVE PARENTS", value: formatCount(stats.activeParents7d), sub: "last 7 days" },
    { label: "QUESTIONS ASKED", value: formatCount(stats.questionsTotal), sub: `${formatCount(stats.questionsToday)} today` },
    { label: "ANSWER RATE", value: formatRate(stats.answerRate), sub: `last ${stats.answerRateDays} days` },
    { label: "NEW TODAY", value: `+${formatCount(stats.newParentsToday)}`, sub: "parents joined" },
  ];
}

const tileStyle = (u: number) => ({
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  padding: `${1.7 * u}px ${2 * u}px`,
  borderRadius: 1.8 * u,
  backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
  border: "1px solid rgba(255,255,255,0.09)",
});

function Tile({ label, value, sub, u, width }: { label: string; value: string; sub: string; u: number; width: number }) {
  return (
    <div style={{ ...tileStyle(u), width }}>
      <span style={{ fontSize: 1.2 * u, letterSpacing: "0.12em", color: MUTED }}>{label}</span>
      <span
        style={{
          fontSize: 4.4 * u,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: 0.5 * u,
          color: INK,
          textShadow: `0 0 ${2 * u}px rgba(232,184,109,0.25)`,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 1.1 * u, color: FAINT }}>{sub}</span>
    </div>
  );
}

function Spark({ stats, u, width, height }: { stats: WallStats; u: number; width: number; height: number }) {
  const padX = 2 * u;
  const padY = 1.7 * u;
  const chartW = Math.max(1, width - padX * 2 - 2);
  const chartH = Math.max(1, height - padY * 2 - 2.2 * u);
  const { line, area, points } = sparklinePaths(
    stats.sparkline.map((d) => d.count),
    chartW,
    chartH,
    Math.max(2, u * 0.4)
  );
  const last = points[points.length - 1];
  return (
    <div style={{ ...tileStyle(u), width, height, justifyContent: "flex-start" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 1.2 * u, letterSpacing: "0.12em", color: MUTED }}>QUESTIONS / DAY</span>
        <span style={{ fontSize: 1.1 * u, color: FAINT }}>{`${stats.sparkline.length} days`}</span>
      </div>
      <div style={{ display: "flex", marginTop: u }}>
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#3d7a5e" />
              <stop offset="70%" stopColor="#9fd8b8" />
              <stop offset="100%" stopColor="#f0c27b" />
            </linearGradient>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7fc4a0" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#7fc4a0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#fill)" />
          <path
            d={line}
            fill="none"
            stroke="url(#stroke)"
            strokeWidth={Math.max(2, u * 0.28)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && <circle cx={last.x} cy={last.y} r={Math.max(2.5, u * 0.45)} fill="#f6d39a" />}
        </svg>
      </div>
    </div>
  );
}

function Collegiate({ stats, size, u }: { stats: WallStats; size: number; u: number }) {
  const c = stats.collegiate;
  if (!c || stats.schoolsCount < 2) return null;
  const parts = [
    `${formatCount(c.parents)} parents`,
    `${formatCount(c.active7d)} active this week`,
    `${formatCount(c.questions)} questions`,
  ];
  if (c.answerRate !== null) parts.push(`${c.answerRate}% answered`);
  return (
    <div style={{ display: "flex", fontSize: size, marginTop: 2.4 * u, color: "rgba(250,248,245,0.4)" }}>
      <span style={{ color: "rgba(232,196,138,0.7)" }}>Collegiate School</span>
      {parts.map((p) => (
        <span key={p} style={{ marginLeft: size * 0.7 }}>{`·  ${p}`}</span>
      ))}
    </div>
  );
}
