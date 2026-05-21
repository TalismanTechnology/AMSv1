"use client";

import { motion } from "framer-motion";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Lock,
  Check,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function HeroAnswerMockup() {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-md sm:max-w-lg">
      <div
        className="metallic-card rounded-2xl p-6 text-left backdrop-blur-sm transition-transform duration-500 hover:rotate-0"
        style={{ transform: "rotate(-1.5deg)" }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full metallic-surface border border-glass-border">
            <span className="text-xs metallic-text">P</span>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Parent · 8:14 AM
            </p>
            <p className="mt-1 text-sm text-foreground">
              When does early-dismissal pickup end?
            </p>
          </div>
        </div>
        <div className="my-4 h-px bg-white/10" />
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
            <Sparkles className="h-3.5 w-3.5 neon-icon-blue" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              AskMySchool
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              Early dismissal ends at <span className="metallic-text">12:15 PM</span>.
              Pickup is available until 12:45 PM at the main entrance.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md metallic-surface border border-glass-border px-2 py-1">
              <FileText className="h-3 w-3 neon-icon-amber" />
              <span className="text-[11px] text-muted-foreground">
                2026 Family Handbook · p. 14
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IngestionMockup() {
  const files = [
    { ext: "PDF", name: "family-handbook.pdf", Icon: FileText, accent: "neon-icon-amber" },
    { ext: "DOCX", name: "school-calendar.docx", Icon: FileText, accent: "neon-icon-blue" },
    { ext: "XLSX", name: "lunch-menu.xlsx", Icon: FileSpreadsheet, accent: "neon-icon-green" },
    { ext: "JPG", name: "field-trip-flyer.jpg", Icon: FileImage, accent: "neon-icon-purple" },
  ];
  return (
    <div className="flex flex-col gap-1.5 px-1 py-2">
      {files.map((f, i) => (
        <motion.div
          key={f.ext}
          className="metallic-card rounded-lg px-3 py-2.5 flex items-center gap-3 backdrop-blur-sm relative overflow-hidden"
          style={{ zIndex: 10 - i }}
          animate={{ y: [0, -2, 0], rotate: (i - 1.5) * 1.2 }}
          transition={{
            y: {
              duration: 3.8,
              delay: i * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        >
          {/* Scanning highlight sweep */}
          <motion.div
            className="absolute inset-y-0 w-1/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.18), transparent)",
            }}
            animate={{ x: ["-120%", "320%"] }}
            transition={{
              duration: 2.4,
              delay: i * 0.55,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 1.4,
            }}
          />
          <f.Icon className={`h-5 w-5 shrink-0 ${f.accent}`} />
          <span className="flex-1 truncate text-xs font-mono text-foreground">
            {f.name}
          </span>
          <span className="rounded border border-glass-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {f.ext}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export function EmbeddingsMockup() {
  const dots = Array.from({ length: 36 }).map((_, i) => ({
    top: 18 + ((Math.sin(i * 0.83) + 1) / 2) * 64,
    left: 8 + ((Math.cos(i * 1.07) + 1) / 2) * 84,
    baseOpacity: 0.25 + ((i * 37) % 70) / 100,
    size: i % 7 === 0 ? 1.5 : 1,
    delay: (i * 0.17) % 3,
    duration: 1.6 + (i % 5) * 0.4,
  }));

  return (
    <div className="flex h-40 items-center gap-2">
      <div className="metallic-surface relative flex-1 overflow-hidden rounded-md border border-glass-border p-2.5">
        <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          chunk #142
        </p>
        <motion.p
          className="text-[11px] font-mono leading-relaxed text-foreground"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          whileInView={{ clipPath: "inset(0 0% 0 0)" }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 2.2, ease: "easeOut" }}
        >
          …students must arrive by 8:00 AM. Tardiness is recorded after the…
        </motion.p>
      </div>
      <motion.div
        animate={{ x: [0, 4, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </motion.div>
      <div className="metallic-surface relative h-full flex-1 overflow-hidden rounded-md border border-glass-border p-2.5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          vector · 768d
        </p>
        <div className="absolute inset-0 mt-7">
          {dots.map((d, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-primary"
              style={{
                top: `${d.top.toFixed(2)}%`,
                left: `${d.left.toFixed(2)}%`,
                width: `${d.size * 3}px`,
                height: `${d.size * 3}px`,
                boxShadow: "0 0 6px var(--glow-primary)",
              }}
              animate={{
                opacity: [
                  d.baseOpacity,
                  Math.min(1, d.baseOpacity * 2.2),
                  d.baseOpacity,
                ],
                scale: [1, 1.4, 1],
              }}
              transition={{
                duration: d.duration,
                delay: d.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RetrievalMockup() {
  const docs = [
    { name: "Family Handbook 2026", approved: true },
    { name: "Bus Routes & Schedules", approved: true },
    { name: "Internal Staff Memo", approved: false },
    { name: "Lunch Menu — Spring", approved: true },
    { name: "Board Minutes (draft)", approved: false },
  ];
  return (
    <div className="metallic-surface relative h-40 overflow-hidden rounded-md border border-glass-border p-3">
      {/* Query sweep highlight */}
      <motion.div
        className="absolute inset-x-0 h-8 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent, oklch(0.7 0.18 220 / 0.18), transparent)",
        }}
        animate={{ y: ["-40%", "180%"] }}
        transition={{
          duration: 3.6,
          repeat: Infinity,
          ease: "easeInOut",
          repeatDelay: 0.6,
        }}
      />
      <p className="relative mb-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Lincoln Elementary · parent scope
      </p>
      <div className="relative space-y-1.5">
        {docs.map((d, i) => (
          <motion.div
            key={d.name}
            className="flex items-center gap-2 text-[11px]"
            animate={
              d.approved
                ? {
                    filter: [
                      "brightness(1)",
                      "brightness(1.5)",
                      "brightness(1)",
                    ],
                  }
                : { opacity: [0.55, 0.4, 0.55] }
            }
            transition={{
              duration: 3.6,
              delay: 0.3 + i * 0.28,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 0.6,
            }}
          >
            {d.approved ? (
              <Check className="h-3 w-3 shrink-0 neon-icon-green" />
            ) : (
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span
              className={
                d.approved
                  ? "text-foreground"
                  : "text-muted-foreground/60 line-through"
              }
            >
              {d.name}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// One shared cycle so every element stays in sync.
// Phases (as fractions of CYCLE):
//   0.00–0.06  question slides in
//   0.10–0.18  answer card appears
//   0.18–0.62  typewriter reveals the answer
//   0.45       cite [1] pops + source 1 lights up
//   0.58       cite [2] pops + source 2 lights up
//   0.62–0.90  hold
//   0.90–1.00  fade everything out, reset
const ANSWER_CYCLE = 9;

function CycleCite({ n, appearAt }: { n: number; appearAt: number }) {
  const a = appearAt;
  return (
    <motion.sup
      className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded metallic-surface border border-glass-border text-[10px] neon-icon-blue align-baseline"
      style={{ transformOrigin: "center" }}
      animate={{
        scale: [0, 0, 1.5, 1, 1, 0.6],
        opacity: [0, 0, 1, 1, 1, 0],
        boxShadow: [
          "0 0 0px 0 oklch(0.7 0.18 220 / 0)",
          "0 0 0px 0 oklch(0.7 0.18 220 / 0)",
          "0 0 14px 2px oklch(0.7 0.18 220 / 0.75)",
          "0 0 6px 0 oklch(0.7 0.18 220 / 0.4)",
          "0 0 6px 0 oklch(0.7 0.18 220 / 0.4)",
          "0 0 0px 0 oklch(0.7 0.18 220 / 0)",
        ],
      }}
      transition={{
        duration: ANSWER_CYCLE,
        times: [0, a - 0.001, a + 0.015, a + 0.06, 0.9, 1],
        repeat: Infinity,
        ease: "easeOut",
      }}
    >
      {n}
    </motion.sup>
  );
}

function CycleSource({
  n,
  title,
  detail,
  appearAt,
}: {
  n: number;
  title: string;
  detail: string;
  appearAt: number;
}) {
  const a = appearAt;
  return (
    <motion.div
      className="flex items-center gap-2 rounded-md border border-glass-border metallic-surface px-2.5 py-1.5"
      animate={{
        opacity: [0.35, 0.35, 1, 1, 0.35],
        x: [-4, -4, 0, 0, -4],
        boxShadow: [
          "0 0 0 0 oklch(0.7 0.18 220 / 0)",
          "0 0 0 0 oklch(0.7 0.18 220 / 0)",
          "0 0 18px 0 oklch(0.7 0.18 220 / 0.35)",
          "0 0 8px 0 oklch(0.7 0.18 220 / 0.2)",
          "0 0 0 0 oklch(0.7 0.18 220 / 0)",
        ],
      }}
      transition={{
        duration: ANSWER_CYCLE,
        times: [0, a - 0.04, a + 0.03, 0.9, 1],
        repeat: Infinity,
        ease: "easeOut",
      }}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded metallic-surface border border-glass-border text-[9px] neon-icon-blue">
        {n}
      </span>
      <FileText className="h-3 w-3 neon-icon-amber" />
      <span className="text-[11px] font-mono text-foreground">{title}</span>
      <span className="text-[10px] font-mono text-muted-foreground">
        · {detail}
      </span>
    </motion.div>
  );
}

export function AnswerMockup() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Parent question */}
      <motion.div
        className="flex items-start gap-2.5 self-end max-w-[88%]"
        animate={{
          opacity: [0, 1, 1, 0],
          y: [4, 0, 0, -2],
        }}
        transition={{
          duration: ANSWER_CYCLE,
          times: [0, 0.06, 0.9, 1],
          repeat: Infinity,
          ease: "easeOut",
        }}
      >
        <div className="rounded-2xl rounded-tr-sm border border-primary/25 bg-primary/10 px-3 py-1.5">
          <p className="text-xs text-foreground">What time is lunch served?</p>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full metallic-surface border border-glass-border">
          <span className="text-[10px] font-medium metallic-text">P</span>
        </div>
      </motion.div>

      {/* AI answer */}
      <motion.div
        className="metallic-surface relative rounded-lg border border-glass-border p-3.5"
        animate={{
          opacity: [0, 0, 1, 1, 0],
          y: [6, 6, 0, 0, -2],
        }}
        transition={{
          duration: ANSWER_CYCLE,
          times: [0, 0.1, 0.18, 0.9, 1],
          repeat: Infinity,
          ease: "easeOut",
        }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex h-4 w-4 items-center justify-center rounded metallic-surface border border-glass-border neon-border">
            <Sparkles className="h-2.5 w-2.5 neon-icon-blue" />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            AskMySchool
          </p>
        </div>

        <motion.div
          className="text-xs leading-relaxed text-foreground sm:text-[13px]"
          animate={{
            clipPath: [
              "inset(0 100% 0 0)",
              "inset(0 100% 0 0)",
              "inset(0 0% 0 0)",
              "inset(0 0% 0 0)",
            ],
          }}
          transition={{
            duration: ANSWER_CYCLE,
            times: [0, 0.18, 0.62, 1],
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          Lunch is served between 11:30 AM and 12:30 PM
          <CycleCite n={1} appearAt={0.45} />. Students may bring meals from
          home as long as no nut products are included
          <CycleCite n={2} appearAt={0.58} />.
        </motion.div>
      </motion.div>

      {/* Sources */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <CycleSource n={1} title="Cafeteria Policy" detail="§3" appearAt={0.45} />
        <CycleSource n={2} title="Family Handbook" detail="p. 22" appearAt={0.58} />
      </div>
    </div>
  );
}
