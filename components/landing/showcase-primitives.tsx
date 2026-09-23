"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BlurReveal } from "@/components/motion";

// Building blocks for the card-led body of the landing page: two-tone
// section headings, rounded tiles (white, or the forest "accent"), inline
// heading chips, captions that sit under a tile, and the number/title/body
// rows of the stats column. Everything sits on the app's cream / forest
// tokens; headings are the light Helvetica Neue face with tight tracking.

/** A muted word inside a heading — the second tone of the two-tone title. */
export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
}) {
  const centered = align === "center";
  return (
    <BlurReveal className={centered ? "text-center" : ""}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2
        className={`font-serif-display text-3xl leading-[1.15] text-ink sm:text-4xl lg:text-[2.75rem] ${
          eyebrow ? "mt-4" : ""
        } ${centered ? "mx-auto max-w-3xl" : "max-w-3xl"}`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 max-w-2xl text-base text-ink-soft sm:text-lg ${
            centered ? "mx-auto" : ""
          }`}
        >
          {subtitle}
        </p>
      )}
    </BlurReveal>
  );
}

export type TileTone = "dark" | "accent";

/** Rounded surface. `accent` is the one forest card in a row of white ones. */
export function Tile({
  tone = "dark",
  className = "",
  children,
}: {
  tone?: TileTone;
  className?: string;
  children: ReactNode;
}) {
  const surface =
    tone === "accent"
      ? "lp-tile-accent text-white"
      : "lp-tile lp-tile-hover text-brand-dark";
  return (
    <div className={`overflow-hidden rounded-[28px] ${surface} ${className}`}>
      {children}
    </div>
  );
}

/** The inset panel a product visual sits on, inside a Tile. */
export function TileVisual({
  tone = "dark",
  className = "",
  children,
}: {
  tone?: TileTone;
  className?: string;
  children: ReactNode;
}) {
  const surface =
    tone === "accent"
      ? "border border-white/15 bg-white/10"
      : "border border-brand-dark/10 bg-brand-light";
  return (
    <div className={`lp-offscreen-skip rounded-2xl p-4 sm:p-5 ${surface} ${className}`}>
      {children}
    </div>
  );
}

// Uses currentColor so the same chip works on a white or a dark tile.
const chipStyle: CSSProperties = {
  background: "color-mix(in srgb, currentColor 10%, transparent)",
  border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
};

/** Inline pill inside a card title, the way Cluely marks the key verb. */
export function Chip({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className="mx-0.5 inline-flex translate-y-[-0.08em] items-center gap-1.5 rounded-full px-2.5 py-0.5 align-middle text-[0.82em] font-medium leading-none"
      style={chipStyle}
    >
      <Icon className="size-[0.9em]" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Title + short description + visual, in one tile. */
export function FeatureCard({
  tone = "dark",
  title,
  description,
  visual,
}: {
  tone?: TileTone;
  title: ReactNode;
  description: string;
  visual: ReactNode;
}) {
  const body = tone === "accent" ? "text-white/70" : "text-ink-soft";
  return (
    <Tile tone={tone} className="flex h-full flex-col p-6 sm:p-8">
      <h3 className="text-xl leading-snug tracking-tight sm:text-2xl">
        {title}
      </h3>
      <p className={`mt-2.5 max-w-md text-sm leading-relaxed sm:text-[15px] ${body}`}>
        {description}
      </p>
      <TileVisual tone={tone} className="mt-7 flex-1">
        {visual}
      </TileVisual>
    </Tile>
  );
}

/** Bold lead + grey body, placed below a tile rather than inside it. */
export function TileCaption({ lead, body }: { lead: string; body: string }) {
  return (
    <p className="mt-5 px-1 text-[15px] leading-relaxed sm:text-base">
      <strong className="font-medium text-ink">{lead}</strong>{" "}
      <span className="text-muted-foreground">{body}</span>
    </p>
  );
}
