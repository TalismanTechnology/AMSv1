"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { LandingImage } from "@/components/landing/landing-images";

// A photograph behind a section, faint and slow. It sits under the content
// (negative z inside an isolated section), drifts at a fraction of scroll
// speed, and dissolves into the cream at its top and bottom edges so the
// section reads as sitting on a scene rather than a flat page. Until the
// file exists a soft sage-and-cream wash stands in, so the depth is there
// even before the imagery.
//
// No CSS blur here on purpose: a live `filter: blur()` on a moving,
// viewport-sized image re-rasterizes every scroll frame. Soft backdrops use
// a pre-blurred, downscaled file instead (the `*-soft.jpg` variants).
//
// Mount inside a section that has `relative isolate`.

type SectionBackdropProps = {
  image: LandingImage;
  /** Photo opacity over the cream; keep it faint (0.15–0.45). */
  opacity?: number;
  /** Parallax travel in px. */
  parallax?: number;
  /** Crop anchor. */
  position?: string;
  /** Which edges dissolve into the page. */
  fade?: "both" | "top" | "bottom" | "none";
  /** Extra classes on the layer, e.g. to extend beyond the section. */
  className?: string;
};

const FADES: Record<NonNullable<SectionBackdropProps["fade"]>, string | undefined> = {
  both: "linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)",
  top: "linear-gradient(180deg, transparent 0%, #000 22%)",
  bottom: "linear-gradient(180deg, #000 78%, transparent 100%)",
  none: undefined,
};

export function SectionBackdrop({
  image,
  opacity = 0.3,
  parallax = 60,
  position = "center",
  fade = "both",
  className = "",
}: SectionBackdropProps) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const reduceMotion = useReducedMotion();
  const [src, setSrc] = useState(image.src);
  const [isMissing, setIsMissing] = useState(false);

  const handleError = () => {
    if (image.standIn && src !== image.standIn) {
      setSrc(image.standIn);
      return;
    }
    setIsMissing(true);
  };

  // Same pre-hydration failure guard as ImagePlate: an <img> that errored
  // before React attached onError is "complete" with zero natural width.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      handleError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only probe
  }, []);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const travel = reduceMotion ? 0 : parallax;
  const y = useTransform(scrollYProgress, [0, 1], [-travel, travel]);

  const mask = FADES[fade];
  const layerStyle: CSSProperties = mask
    ? { maskImage: mask, WebkitMaskImage: mask }
    : {};

  return (
    <div
      ref={ref}
      aria-hidden
      style={layerStyle}
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {!isMissing && (
        <motion.img
          ref={imgRef}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleError}
          style={{ y, opacity, objectPosition: position }}
          className="absolute inset-0 h-full w-full scale-110 object-cover text-transparent"
        />
      )}
      {isMissing && (
        <motion.div
          style={{ y, opacity: Math.min(1, opacity * 2) }}
          className="absolute inset-0 scale-110 bg-[radial-gradient(70%_60%_at_20%_30%,rgba(122,154,124,0.3)_0%,rgba(122,154,124,0)_70%),radial-gradient(90%_70%_at_70%_80%,rgba(45,58,46,0.12)_0%,rgba(45,58,46,0)_70%)]"
        />
      )}
      <div className="lp-grain absolute inset-0 opacity-30" />
    </div>
  );
}
