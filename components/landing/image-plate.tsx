"use client";


import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { LandingImage } from "@/components/landing/landing-images";

// A photograph mounted as a physical object: a rounded plate with a hairline
// edge, a soft inner sheen, film grain, and a real drop shadow. The image
// scrolls slightly slower than the page (parallax) so the plate reads as a
// window into a scene rather than a flat rectangle.
//
// Until the file exists the plate shows a designed cream fallback (a soft
// radial wash plus the grain), so imagery slots can ship before the assets.

type ImagePlateProps = {
  image: LandingImage;
  /** Slot aspect ratio, e.g. "16/9". Defaults to the image's own. */
  ratio?: string;
  /** Vertical parallax travel in px (0 disables). */
  parallax?: number;
  /** Corner radius class. */
  rounded?: string;
  /** Extra classes on the outer plate. */
  className?: string;
  /** Where to anchor the crop. */
  position?: string;
  /** Loading priority for above-the-fold slots. */
  priority?: boolean;
  /** Content layered over the photo (captions, floating cards). */
  children?: ReactNode;
  /** Fill the parent instead of sizing by aspect ratio (full-bleed bands). */
  fill?: boolean;
};

export function ImagePlate({
  image,
  ratio,
  parallax = 40,
  rounded = "rounded-[28px]",
  className = "",
  position = "center",
  priority = false,
  children,
  fill = false,
}: ImagePlateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const reduceMotion = useReducedMotion();
  const [src, setSrc] = useState(image.src);
  const [isMissing, setIsMissing] = useState(false);

  // First failure: fall back to the stand-in photo. Second: the flat card.
  const handleError = () => {
    if (image.standIn && src !== image.standIn) {
      setSrc(image.standIn);
      return;
    }
    setIsMissing(true);
  };

  // A server-rendered <img> near the top of the page can fail before React
  // hydrates, so its error event is never seen by onError. Check the DOM
  // state once on mount and treat "complete but zero-width" as a failure.
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

  const style: CSSProperties = fill ? {} : { aspectRatio: ratio ?? image.ratio };
  const box = fill ? "absolute inset-0" : "relative";

  return (
    <div
      ref={ref}
      style={style}
      className={`lp-plate ${box} isolate overflow-hidden ${rounded} ${className}`}
    >
      {/* Photo layer, oversized so the parallax never exposes an edge */}
      {!isMissing && (
        <motion.img
          ref={imgRef}
          src={src}
          alt={image.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={handleError}
          style={{ y, objectPosition: position }}
          className="absolute inset-0 h-full w-full scale-[1.12] object-cover text-transparent"
        />
      )}

      {/* Quiet fallback: a flat warm card, slightly darker at the foot */}
      {isMissing && (
        <div
          aria-label={image.alt}
          role="img"
          className="absolute inset-0 bg-[linear-gradient(180deg,#f1eee8_0%,#e9e5dd_100%)]"
        />
      )}

      {/* Grain + edge light: the parts that make it read as an object */}
      <div aria-hidden className="lp-grain pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-brand-dark/15"
      />

      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
